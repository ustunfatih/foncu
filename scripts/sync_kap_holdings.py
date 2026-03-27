#!/usr/bin/env python3
"""Monthly KAP holdings sync for true stock-level overlap.

Fetches investment fund portfolio disclosures from KAP, parses stock rows from
"Portföy Dağılım Raporu" PDFs, and upserts normalized holdings into Supabase.

Designed for GitHub Actions or manual one-off runs, not short-lived Vercel
functions.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

import pdfplumber
import requests
from pypdf import PdfReader

requests.packages.urllib3.disable_warnings()  # type: ignore[attr-defined]

PORTFOLIO_REPORT_DISCLOSURE_TYPE = "8aca490d502e34b801502e380044002b"
KAP_DISCLOSURE_FILTER_URL = "https://kap.org.tr/tr/api/disclosure/filter/FILTERYFBF"
KAP_DISCLOSURE_PAGE_URL = "https://www.kap.org.tr/tr/Bildirim"
KAP_FILE_DOWNLOAD_URL = "https://kap.org.tr/tr/api/file/download"
TEFAS_ANALYZE_URL = "https://www.tefas.gov.tr/api/DB/GetAllFundAnalyzeData"

HTTP_CONNECT_TIMEOUT = 10
HTTP_READ_TIMEOUT = 20
PDF_READ_TIMEOUT = 45
SUPABASE_TIMEOUT = 60
SUPABASE_WRITE_TIMEOUT = 120

STRICT_ROW_PATTERN = re.compile(
    r"^(?P<symbol>[A-Z0-9.\-]{2,12})\s+"
    r"(?P<currency>[A-Z]{2,4})\s+"
    r"(?P<name>.+?)\s+"
    r"(?P<isin>[A-Z0-9]{12})\s+"
    r"(?P<nominal>-?[\d\.,]+)\s+"
    r"(?P<cost>[\d\.,]+)\s+"
    r"(?P<trade_date>\d{2}/\d{2}/\d{2})\s+"
    r"\d+\s+"
    r"(?P<price>[\d\.,]+)\s+"
    r"(?P<market_value>-?[\d\.,]+)\s+"
    r"(?P<group_pct>-?[\d\.,]+)\s+"
    r"(?P<fpd_pct>-?[\d\.,]+)\s+"
    r"(?P<ftd_pct>-?[\d\.,]+)$"
)

LOOSE_ROW_PATTERN = re.compile(
    r"^(?P<symbol>[A-Z0-9.\-]{2,12})\s+"
    r"(?P<currency>[A-Z]{2,4})\s+"
    r"(?P<name>.+?)\s+"
    r"(?P<isin>[A-Z0-9]{12})\s+"
    r"(?P<nominal>-?[\d\.,]+).*?"
    r"(?P<market_value>-?[\d\.,]+)\s+"
    r"(?P<group_pct>-?[\d\.,]+)\s+"
    r"(?P<fpd_pct>-?[\d\.,]+)\s+"
    r"(?P<ftd_pct>-?[\d\.,]+)$"
)

STOCK_SECTION_MARKERS = (
    "HİSSE SENETLERİ",
    "YABANCI HİSSE SENETLERİ",
)

SECTION_END_MARKERS = (
    "GRUP TOPLAMI",
    "BORÇLANMA SENETLERİ",
    "TÜREV ARAÇLAR",
    "YATIRIM FONU",
    "BORSA YATIRIM FONU",
    "TAKASBANK PARA PİYASASI",
    "TERS REPO",
    "REPO",
    "MEVDUAT",
)


@dataclass
class HoldingRow:
    symbol: str
    isin: str | None
    name: str
    weight: float
    nominal: float | None
    market_value: float | None


@dataclass
class ParseResult:
    holdings: list[HoldingRow]
    section_found: bool
    confidence: float
    parser: str


class SyncError(Exception):
    pass


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SyncError(f"{name} environment variable is required")
    return value


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync monthly fund holdings from KAP disclosures")
    parser.add_argument("--target-period", help="Target report period in YYYY-MM format")
    parser.add_argument("--fund-code", action="append", dest="fund_codes", help="Sync only the given fund code(s)")
    parser.add_argument("--max-workers", type=int, default=int(os.getenv("KAP_HOLDINGS_MAX_WORKERS", "10")))
    parser.add_argument(
        "--days",
        type=int,
        default=int(os.getenv("KAP_HOLDINGS_LOOKBACK_DAYS", "120")),
        help="How far back to search disclosures",
    )
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def previous_month_period(today: date | None = None) -> tuple[int, int]:
    today = today or date.today()
    year = today.year
    month = today.month - 1
    if month == 0:
        year -= 1
        month = 12
    return year, month


def resolve_target_period(value: str | None) -> tuple[int, int]:
    if not value:
        return previous_month_period()
    match = re.fullmatch(r"(\d{4})-(\d{2})", value.strip())
    if not match:
        raise SyncError("target period must be in YYYY-MM format")
    return int(match.group(1)), int(match.group(2))


def parse_decimal(value: str | float | int | None) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = str(value).strip().replace(".", "").replace(",", ".")
    if cleaned in {"", "-", "--"}:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def month_name(year: int, month: int) -> str:
    return f"{year}-{month:02d}"


def build_supabase_headers(service_role_key: str) -> dict[str, str]:
    return {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }


def supabase_select(url: str, key: str, path: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    headers = build_supabase_headers(key)
    rows: list[dict[str, Any]] = []
    offset = 0
    limit = 1000

    while True:
        response = requests.get(
            f"{url}/rest/v1/{path}",
            headers=headers,
            params={**params, "limit": limit, "offset": offset},
            timeout=SUPABASE_TIMEOUT,
        )
        response.raise_for_status()
        page = response.json()
        rows.extend(page)
        if len(page) < limit:
            break
        offset += limit

    return rows


def supabase_upsert(url: str, key: str, path: str, rows: list[dict[str, Any]], conflict: str) -> None:
    if not rows:
        return
    headers = build_supabase_headers(key)
    headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
    response = requests.post(
        f"{url}/rest/v1/{path}",
        headers=headers,
        params={"on_conflict": conflict},
        json=rows,
        timeout=SUPABASE_WRITE_TIMEOUT,
    )
    response.raise_for_status()


def load_fund_profiles(
    supabase_url: str,
    service_key: str,
    requested_codes: list[str] | None,
    allowed_codes: set[str] | None = None,
) -> list[dict[str, Any]]:
    params = {
        "select": "fon_kodu,unvan,kap_link,kap_fund_id",
        "fon_tipi": "eq.mutual",
        "order": "fon_kodu.asc",
    }
    try:
        rows = supabase_select(supabase_url, service_key, "fund_profiles", params)
    except requests.HTTPError:
        rows = supabase_select(
            supabase_url,
            service_key,
            "fund_profiles",
            {
                "select": "fon_kodu,unvan",
                "fon_tipi": "eq.mutual",
                "order": "fon_kodu.asc",
            },
        )
        rows = [{**row, "kap_link": None, "kap_fund_id": None} for row in rows]
    if requested_codes:
        normalized = {code.upper() for code in requested_codes}
        rows = [row for row in rows if row.get("fon_kodu") in normalized]
    if allowed_codes is not None:
        rows = [row for row in rows if row.get("fon_kodu") in allowed_codes]
    return rows


def load_tefas_tradable_codes() -> set[str]:
    try:
        result = subprocess.run(
            ["node", "scripts/export_tefas_yat_codes.js"],
            capture_output=True,
            text=True,
            timeout=90,
            check=True,
        )
    except subprocess.TimeoutExpired as exc:
        raise SyncError("Timed out while resolving the TEFAS YAT fund universe") from exc
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or exc.stdout.strip() or str(exc)
        raise SyncError(f"Failed to resolve the TEFAS YAT fund universe: {detail}") from exc

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise SyncError(f"TEFAS scope script returned invalid JSON: {result.stdout[:200]}") from exc

    codes = {
        str(code).strip().upper()
        for code in payload.get("codes", [])
        if str(code).strip()
    }
    if not codes:
        raise SyncError("TEFAS scope script returned no YAT fund codes")
    return codes


def fetch_tefas_detail(fund_code: str) -> dict[str, Any]:
    headers = {
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.tefas.gov.tr/FonAnaliz.aspx",
    }

    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = requests.post(
                TEFAS_ANALYZE_URL,
                data={"dil": "TR", "fonkod": fund_code.upper()},
                headers=headers,
                timeout=(HTTP_CONNECT_TIMEOUT, HTTP_READ_TIMEOUT),
                verify=False,
            )
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep((attempt + 1) * 1.5)

    raise SyncError(f"Failed to fetch TEFAS detail for {fund_code}: {last_error}")


def extract_obj_id_from_kap_page(kap_link: str) -> str | None:
    html = requests.get(kap_link, timeout=(HTTP_CONNECT_TIMEOUT, HTTP_READ_TIMEOUT)).text
    match = re.search(r'objId\\":\\"([a-fA-F0-9]{32})', html)
    return match.group(1) if match else None


def get_disclosures(kap_fund_id: str, days: int) -> list[dict[str, Any]]:
    normalized_days = max(30, min(int(days), 365))
    response = requests.get(
        f"{KAP_DISCLOSURE_FILTER_URL}/{kap_fund_id}/{PORTFOLIO_REPORT_DISCLOSURE_TYPE}/{normalized_days}",
        timeout=(HTTP_CONNECT_TIMEOUT, HTTP_READ_TIMEOUT),
    )
    response.raise_for_status()
    return response.json()


def choose_disclosure(disclosures: list[dict[str, Any]], year: int, month: int) -> dict[str, Any] | None:
    for disclosure in disclosures:
        basic = disclosure.get("disclosureBasic", {})
        if basic.get("year") == year and basic.get("donem") == month:
            return basic
    return None


def get_file_id(disclosure_index: int) -> str | None:
    html = requests.get(
        f"{KAP_DISCLOSURE_PAGE_URL}/{disclosure_index}",
        timeout=(HTTP_CONNECT_TIMEOUT, HTTP_READ_TIMEOUT),
    ).text
    match = re.search(r"file/download/([a-f0-9]{32})", html)
    return match.group(1) if match else None


def download_pdf(file_id: str) -> bytes:
    response = requests.get(
        f"{KAP_FILE_DOWNLOAD_URL}/{file_id}",
        timeout=(HTTP_CONNECT_TIMEOUT, PDF_READ_TIMEOUT),
    )
    response.raise_for_status()
    data = response.content
    pdf_start = data.find(b"%PDF-")
    if pdf_start == -1:
        raise SyncError(f"Downloaded attachment {file_id} is not a PDF payload")
    return data[pdf_start:]


def extract_text_with_pdfplumber(pdf_bytes: bytes) -> str:
    parts: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text:
                parts.append(text)
    return "\n".join(parts)


def extract_text_with_pypdf(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def normalize_lines(text: str) -> list[str]:
    return [
        re.sub(r"\s+", " ", line).strip()
        for line in text.splitlines()
        if line and line.strip()
    ]


def parse_holdings_from_text(text: str, parser_name: str) -> ParseResult:
    lines = normalize_lines(text)
    section_found = any(any(marker in line.upper() for marker in STOCK_SECTION_MARKERS) for line in lines)
    aggregated: dict[str, HoldingRow] = {}
    strict_hits = 0

    for line in lines:
        match = STRICT_ROW_PATTERN.match(line) or LOOSE_ROW_PATTERN.match(line)
        if not match:
            continue

        if STRICT_ROW_PATTERN.match(line):
            strict_hits += 1

        symbol = match.group("symbol").replace(".E", "").upper()
        if not re.fullmatch(r"[A-Z][A-Z0-9.\-]{1,6}", symbol):
            continue
        weight = parse_decimal(match.group("ftd_pct"))
        nominal = parse_decimal(match.group("nominal"))
        market_value = parse_decimal(match.group("market_value"))

        if weight is None:
            continue

        existing = aggregated.get(symbol)
        if existing is None:
            aggregated[symbol] = HoldingRow(
                symbol=symbol,
                isin=match.groupdict().get("isin"),
                name=match.group("name").strip(),
                weight=weight,
                nominal=nominal,
                market_value=market_value,
            )
        else:
            existing.weight += weight
            if nominal is not None:
                existing.nominal = (existing.nominal or 0.0) + nominal
            if market_value is not None:
                existing.market_value = (existing.market_value or 0.0) + market_value

    holdings = [
        holding for holding in aggregated.values()
        if holding.weight is not None and holding.weight > 0
    ]
    holdings.sort(key=lambda row: row.weight, reverse=True)

    total_weight = sum(row.weight for row in holdings)
    strict_ratio = strict_hits / max(len(holdings), 1)
    confidence = min(1.0, (len(holdings) / 12.0) * 0.35 + min(total_weight, 100) / 100.0 * 0.45 + strict_ratio * 0.20)

    return ParseResult(
        holdings=holdings,
        section_found=section_found,
        confidence=confidence,
        parser=parser_name,
    )


def parse_holdings(pdf_bytes: bytes) -> ParseResult:
    plumber_text = extract_text_with_pdfplumber(pdf_bytes)
    if plumber_text.strip():
        plumber_attempt = parse_holdings_from_text(plumber_text, "pdfplumber")
        if plumber_attempt.section_found and (
            len(plumber_attempt.holdings) >= 8 or plumber_attempt.confidence >= 0.7
        ):
            return plumber_attempt
        attempts: list[ParseResult] = [plumber_attempt]
    else:
        attempts = []

    pypdf_text = extract_text_with_pypdf(pdf_bytes)
    if pypdf_text.strip():
        attempts.append(parse_holdings_from_text(pypdf_text, "pypdf"))

    attempts = [attempt for attempt in attempts if attempt.section_found or attempt.holdings]
    if not attempts:
        return ParseResult(holdings=[], section_found=False, confidence=0.0, parser="none")

    attempts.sort(key=lambda item: (len(item.holdings), item.confidence), reverse=True)
    return attempts[0]


def build_holdings_rows(fund_code: str, year: int, month: int, holdings: list[HoldingRow]) -> list[dict[str, Any]]:
    now = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    rows = []
    for holding in holdings:
        rows.append({
            "fon_kodu": fund_code,
            "hisse_kodu": holding.symbol,
            "yuzdesel_agirlik": holding.weight,
            "fondaki_lot": holding.nominal,
            "asset_type": "equity",
            "rapor_ay": month,
            "rapor_yil": year,
            "guncelleme_zamani": now,
        })
    return rows


def sync_single_fund(profile: dict[str, Any], target_year: int, target_month: int, days: int) -> dict[str, Any]:
    code = profile["fon_kodu"].upper()
    kap_link = profile.get("kap_link")
    kap_fund_id = profile.get("kap_fund_id")

    if not kap_link:
        detail = fetch_tefas_detail(code)
        kap_link = (((detail or {}).get("fundProfile") or [{}])[0] or {}).get("KAPLINK")

    if not kap_link:
        return {"fund_code": code, "status": "missing_kap_link", "holdings": [], "kap_link": None, "kap_fund_id": None}

    if not kap_fund_id:
        kap_fund_id = extract_obj_id_from_kap_page(kap_link)

    if not kap_fund_id:
        return {"fund_code": code, "status": "missing_kap_fund_id", "holdings": [], "kap_link": kap_link, "kap_fund_id": None}

    disclosures = get_disclosures(kap_fund_id, days)
    disclosure = choose_disclosure(disclosures, target_year, target_month)
    if not disclosure:
        return {"fund_code": code, "status": "missing_period", "holdings": [], "kap_link": kap_link, "kap_fund_id": kap_fund_id}

    file_id = get_file_id(disclosure["disclosureIndex"])
    if not file_id:
        return {"fund_code": code, "status": "missing_pdf", "holdings": [], "kap_link": kap_link, "kap_fund_id": kap_fund_id}

    pdf_bytes = download_pdf(file_id)
    parsed = parse_holdings(pdf_bytes)
    holdings_rows = build_holdings_rows(code, target_year, target_month, parsed.holdings)

    return {
        "fund_code": code,
        "status": "ok" if parsed.holdings else "no_stock_holdings",
        "holdings": holdings_rows,
        "kap_link": kap_link,
        "kap_fund_id": kap_fund_id,
        "parser": parsed.parser,
        "confidence": parsed.confidence,
        "row_count": len(parsed.holdings),
        "total_weight": round(sum(item["yuzdesel_agirlik"] for item in holdings_rows), 2),
        "publish_date": disclosure.get("publishDate"),
    }


def main() -> int:
    args = parse_args()
    supabase_url = require_env("SUPABASE_URL")
    supabase_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    target_year, target_month = resolve_target_period(args.target_period)
    tefas_codes = load_tefas_tradable_codes()
    profiles = load_fund_profiles(supabase_url, supabase_key, args.fund_codes, tefas_codes)
    if not profiles:
        raise SyncError("No TEFAS-tradable mutual fund profiles found to sync")

    print(
        f"Syncing KAP holdings for {len(profiles)} TEFAS-tradable mutual funds "
        f"for {month_name(target_year, target_month)}",
        flush=True,
    )
    print(f"[scope] latest TEFAS YAT universe contains {len(tefas_codes)} fund codes", flush=True)

    results: list[dict[str, Any]] = []
    all_holdings: list[dict[str, Any]] = []
    mapping_rows: list[dict[str, Any]] = []
    completed = 0

    started = time.time()
    with ThreadPoolExecutor(max_workers=max(1, args.max_workers)) as executor:
        futures = {
            executor.submit(sync_single_fund, profile, target_year, target_month, args.days): profile["fon_kodu"]
            for profile in profiles
        }
        for future in as_completed(futures):
            code = futures[future]
            try:
                result = future.result()
            except Exception as exc:  # noqa: BLE001
                result = {"fund_code": code, "status": "error", "error": str(exc), "holdings": []}

            results.append(result)
            all_holdings.extend(result.get("holdings", []))
            completed += 1

            if result.get("kap_link") and result.get("kap_fund_id"):
                mapping_rows.append({
                    "fon_kodu": result["fund_code"],
                    "kap_link": result["kap_link"],
                    "kap_fund_id": result["kap_fund_id"],
                    "guncelleme_zamani": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
                })

            print(
                f"[{completed}/{len(profiles)}] [{result['fund_code']}] {result['status']}"
                + (f" rows={result.get('row_count', 0)} weight={result.get('total_weight', 0)}" if result["status"] in {"ok", "no_stock_holdings"} else "")
                + (f" error={result['error']}" if result.get("error") else ""),
                flush=True,
            )

    ok_results = [result for result in results if result["status"] == "ok"]
    failed_results = [result for result in results if result["status"] not in {"ok", "no_stock_holdings"}]
    elapsed = round(time.time() - started, 2)

    if not args.dry_run:
        if mapping_rows:
            deduped_mapping_rows = list({row["fon_kodu"]: row for row in mapping_rows}.values())
            supabase_upsert(
                supabase_url,
                supabase_key,
                "fund_profiles",
                deduped_mapping_rows,
                "fon_kodu",
            )
        supabase_upsert(
            supabase_url,
            supabase_key,
            "fund_holdings",
            all_holdings,
            "fon_kodu,hisse_kodu,rapor_yil,rapor_ay",
        )
        snapshot_status = "ready" if not failed_results else "partial"
        snapshot_payload = [{
            "rapor_yil": target_year,
            "rapor_ay": target_month,
            "acquired_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "source": "kap_pdf_hybrid_parser",
            "fund_count": len(ok_results),
            "holding_count": len(all_holdings),
            "status": snapshot_status,
            "updated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        }]
        supabase_upsert(
            supabase_url,
            supabase_key,
            "fund_holdings_snapshots",
            snapshot_payload,
            "rapor_yil,rapor_ay",
        )

    summary = {
        "target_period": month_name(target_year, target_month),
        "total_funds": len(profiles),
        "ok_funds": len(ok_results),
        "no_stock_holdings": len([result for result in results if result["status"] == "no_stock_holdings"]),
        "failed_funds": len(failed_results),
        "holding_rows": len(all_holdings),
        "elapsed_seconds": elapsed,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)

    return 1 if failed_results else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SyncError as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        raise SystemExit(1)

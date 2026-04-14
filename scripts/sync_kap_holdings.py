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
import logging
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
from requests import Response

requests.packages.urllib3.disable_warnings()  # type: ignore[attr-defined]

logger = logging.getLogger(__name__)

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
RATE_LIMIT_WAIT_SECONDS = 45
DEFAULT_BATCH_SIZE = 100
DEFAULT_BATCH_COOLDOWN_SECONDS = 30

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

COMPACT_SECTION_ROW_PATTERN = re.compile(
    r"^(?P<symbol>[A-Z0-9.\-]{2,12})\s+"
    r"(?P<name>.+?)\s+"
    r"(?P<nominal>-?[\d\.,]+)\s+"
    r"(?P<market_value>-?[\d\.,]+)\s+"
    r"(?P<ftd_pct>-?[\d\.,]+%?)$"
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
        "--batch-size",
        type=int,
        default=int(os.getenv("KAP_HOLDINGS_BATCH_SIZE", str(DEFAULT_BATCH_SIZE))),
        help="How many funds to process in each chunk",
    )
    parser.add_argument(
        "--cooldown-seconds",
        type=int,
        default=int(os.getenv("KAP_HOLDINGS_BATCH_COOLDOWN_SECONDS", str(DEFAULT_BATCH_COOLDOWN_SECONDS))),
        help="How long to pause between chunks",
    )
    parser.add_argument(
        "--resume",
        dest="resume",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Skip funds that already have holdings stored for the target period",
    )
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
    cleaned = str(value).strip().replace("%", "")
    if cleaned in {"", "-", "--"}:
        return None
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(".") > cleaned.rfind(","):
            cleaned = cleaned.replace(",", "")
        else:
            cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        integer, _, fraction = cleaned.rpartition(",")
        if integer and fraction:
            if len(fraction) in {1, 2}:
                cleaned = cleaned.replace(".", "").replace(",", ".")
            elif len(fraction) == 3 and integer.replace(".", "").isdigit():
                cleaned = cleaned.replace(",", "")
            else:
                cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "." in cleaned:
        integer, _, fraction = cleaned.rpartition(".")
        if integer and fraction and len(fraction) == 3 and integer.replace(",", "").isdigit():
            cleaned = cleaned.replace(".", "")
        else:
            cleaned = cleaned.replace(",", "")
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


def request_with_backoff(
    method: str,
    url: str,
    *,
    attempts: int = 4,
    rate_limit_wait_seconds: int = RATE_LIMIT_WAIT_SECONDS,
    **kwargs: Any,
) -> Response:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            response = requests.request(method, url, **kwargs)
            if response.status_code in {403, 429}:
                retry_after = response.headers.get("Retry-After")
                wait_seconds = rate_limit_wait_seconds
                if retry_after:
                    try:
                        wait_seconds = max(wait_seconds, int(retry_after))
                    except ValueError:
                        pass
                if attempt == attempts - 1:
                    response.raise_for_status()
                logger.warning(
                    f"[rate-limit] {method.upper()} {url} returned {response.status_code}; "
                    f"sleeping {wait_seconds}s before retry {attempt + 2}/{attempts}",
                )
                time.sleep(wait_seconds)
                continue
            response.raise_for_status()
            return response
        except requests.HTTPError as exc:
            last_error = exc
            if attempt == attempts - 1:
                raise
            wait_seconds = min(rate_limit_wait_seconds, 8 * (attempt + 1))
            logger.warning(
                f"[retry] {method.upper()} {url} failed with HTTP error; "
                f"sleeping {wait_seconds}s before retry {attempt + 2}/{attempts}",
            )
            time.sleep(wait_seconds)
        except requests.RequestException as exc:
            last_error = exc
            if attempt == attempts - 1:
                raise
            wait_seconds = min(15, 3 * (attempt + 1))
            logger.warning(
                f"[retry] {method.upper()} {url} failed with network error; "
                f"sleeping {wait_seconds}s before retry {attempt + 2}/{attempts}",
            )
            time.sleep(wait_seconds)

    raise SyncError(f"Request failed for {url}: {last_error}")


def supabase_select(url: str, key: str, path: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    headers = build_supabase_headers(key)
    rows: list[dict[str, Any]] = []
    offset = 0
    limit = 1000

    while True:
        response = request_with_backoff(
            "get",
            f"{url}/rest/v1/{path}",
            headers=headers,
            params={**params, "limit": limit, "offset": offset},
            timeout=SUPABASE_TIMEOUT,
        )
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
    request_with_backoff(
        "post",
        f"{url}/rest/v1/{path}",
        headers=headers,
        params={"on_conflict": conflict},
        json=rows,
        timeout=SUPABASE_WRITE_TIMEOUT,
    )


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


def load_existing_holdings_for_period(
    supabase_url: str,
    service_key: str,
    target_year: int,
    target_month: int,
) -> tuple[set[str], int]:
    rows = supabase_select(
        supabase_url,
        service_key,
        "fund_holdings",
        {
            "select": "fon_kodu",
            "rapor_yil": f"eq.{target_year}",
            "rapor_ay": f"eq.{target_month}",
        },
    )
    completed_codes = {
        str(row.get("fon_kodu", "")).strip().upper()
        for row in rows
        if str(row.get("fon_kodu", "")).strip()
    }
    return completed_codes, len(rows)


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
            response = request_with_backoff(
                "post",
                TEFAS_ANALYZE_URL,
                data={"dil": "TR", "fonkod": fund_code.upper()},
                headers=headers,
                timeout=(HTTP_CONNECT_TIMEOUT, HTTP_READ_TIMEOUT),
                verify=False,
            )
            return response.json()
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep((attempt + 1) * 1.5)

    raise SyncError(f"Failed to fetch TEFAS detail for {fund_code}: {last_error}")


def extract_obj_id_from_kap_page(kap_link: str) -> str | None:
    html = request_with_backoff(
        "get",
        kap_link,
        timeout=(HTTP_CONNECT_TIMEOUT, HTTP_READ_TIMEOUT),
    ).text
    match = re.search(r'objId\\":\\"([a-fA-F0-9]{32})', html)
    return match.group(1) if match else None


def get_disclosures(kap_fund_id: str, days: int) -> list[dict[str, Any]]:
    normalized_days = max(30, min(int(days), 365))
    response = request_with_backoff(
        "get",
        f"{KAP_DISCLOSURE_FILTER_URL}/{kap_fund_id}/{PORTFOLIO_REPORT_DISCLOSURE_TYPE}/{normalized_days}",
        timeout=(HTTP_CONNECT_TIMEOUT, HTTP_READ_TIMEOUT),
    )
    return response.json()


def choose_disclosure(disclosures: list[dict[str, Any]], year: int, month: int) -> dict[str, Any] | None:
    for disclosure in disclosures:
        basic = disclosure.get("disclosureBasic", {})
        if basic.get("year") == year and basic.get("donem") == month:
            return basic
    return None


def get_file_id(disclosure_index: int) -> str | None:
    html = request_with_backoff(
        "get",
        f"{KAP_DISCLOSURE_PAGE_URL}/{disclosure_index}",
        timeout=(HTTP_CONNECT_TIMEOUT, HTTP_READ_TIMEOUT),
    ).text
    match = re.search(r"file/download/([a-f0-9]{32})", html)
    return match.group(1) if match else None


def download_pdf(file_id: str) -> bytes:
    response = request_with_backoff(
        "get",
        f"{KAP_FILE_DOWNLOAD_URL}/{file_id}",
        timeout=(HTTP_CONNECT_TIMEOUT, PDF_READ_TIMEOUT),
    )
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


def is_table_section_header(line: str) -> bool:
    return bool(re.match(r"^[A-ZÇĞİÖŞÜ]\)", line.upper()))


def build_confidence(holdings: list[HoldingRow], strict_hits: int = 0) -> float:
    if not holdings:
        return 0.0
    total_weight = sum(row.weight for row in holdings)
    strict_ratio = strict_hits / max(len(holdings), 1)
    return min(
        1.0,
        (len(holdings) / 12.0) * 0.35
        + min(total_weight, 100) / 100.0 * 0.45
        + strict_ratio * 0.20,
    )


def parse_compact_stock_section(lines: list[str], parser_name: str) -> ParseResult:
    aggregated: dict[str, HoldingRow] = {}
    section_found = False
    in_stock_section = False

    for line in lines:
        upper = line.upper()
        if any(marker in upper for marker in STOCK_SECTION_MARKERS):
            section_found = True
            in_stock_section = True
            continue

        if not in_stock_section:
            continue

        if upper.startswith("TOPLAM"):
            in_stock_section = False
            continue

        if is_table_section_header(line):
            in_stock_section = False
            continue

        if line.startswith("İhraççı") or line.startswith("Nominal Değeri"):
            continue

        match = COMPACT_SECTION_ROW_PATTERN.match(line)
        if not match:
            continue

        symbol = match.group("symbol").replace(".E", "").upper()
        if not re.fullmatch(r"[A-Z][A-Z0-9.\-]{1,10}", symbol):
            continue

        weight = parse_decimal(match.group("ftd_pct"))
        nominal = parse_decimal(match.group("nominal"))
        market_value = parse_decimal(match.group("market_value"))
        if weight is None or weight <= 0:
            continue

        existing = aggregated.get(symbol)
        if existing is None:
            aggregated[symbol] = HoldingRow(
                symbol=symbol,
                isin=None,
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

    holdings = [holding for holding in aggregated.values() if holding.weight > 0]
    holdings.sort(key=lambda row: row.weight, reverse=True)
    return ParseResult(
        holdings=holdings,
        section_found=section_found,
        confidence=build_confidence(holdings),
        parser=parser_name,
    )


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
    confidence = build_confidence(holdings, strict_hits)

    compact_attempt = parse_compact_stock_section(lines, f"{parser_name}_compact")
    if len(compact_attempt.holdings) > len(holdings):
        return compact_attempt

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


def build_snapshot_payload(
    target_year: int,
    target_month: int,
    *,
    fund_count: int,
    holding_count: int,
    status: str,
) -> list[dict[str, Any]]:
    now = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    return [{
        "rapor_yil": target_year,
        "rapor_ay": target_month,
        "acquired_at": now,
        "source": "kap_pdf_hybrid_parser",
        "fund_count": fund_count,
        "holding_count": holding_count,
        "status": status,
        "updated_at": now,
    }]


def chunk_profiles(profiles: list[dict[str, Any]], batch_size: int) -> list[list[dict[str, Any]]]:
    normalized_size = max(1, int(batch_size))
    return [profiles[index:index + normalized_size] for index in range(0, len(profiles), normalized_size)]


def persist_batch(
    supabase_url: str,
    supabase_key: str,
    target_year: int,
    target_month: int,
    batch_results: list[dict[str, Any]],
    batch_holdings: list[dict[str, Any]],
    cumulative_ok_funds: int,
    cumulative_holding_rows: int,
    *,
    final: bool,
    has_failures: bool,
) -> None:
    if batch_holdings:
        supabase_upsert(
            supabase_url,
            supabase_key,
            "fund_holdings",
            batch_holdings,
            "fon_kodu,hisse_kodu,rapor_yil,rapor_ay",
        )

    snapshot_status = "ready" if final and not has_failures else "partial"
    supabase_upsert(
        supabase_url,
        supabase_key,
        "fund_holdings_snapshots",
        build_snapshot_payload(
            target_year,
            target_month,
            fund_count=cumulative_ok_funds,
            holding_count=cumulative_holding_rows,
            status=snapshot_status,
        ),
        "rapor_yil,rapor_ay",
    )

    mapping_rows = [
        {
            "fon_kodu": result["fund_code"],
            "kap_link": result["kap_link"],
            "kap_fund_id": result["kap_fund_id"],
            "guncelleme_zamani": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        }
        for result in batch_results
        if result.get("kap_link") and result.get("kap_fund_id")
    ]

    if mapping_rows:
        deduped_mapping_rows = list({row["fon_kodu"]: row for row in mapping_rows}.values())
        try:
            supabase_upsert(
                supabase_url,
                supabase_key,
                "fund_profiles",
                deduped_mapping_rows,
                "fon_kodu",
            )
        except requests.HTTPError as exc:
            detail = ""
            if exc.response is not None:
                detail = exc.response.text[:500]
            logger.warning(
                f"[warn] failed to update KAP mappings for {len(deduped_mapping_rows)} fund(s): "
                f"{exc}{f' :: {detail}' if detail else ''}",
            )


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

    existing_completed_codes: set[str] = set()
    existing_holding_rows = 0
    if args.resume:
        existing_completed_codes, existing_holding_rows = load_existing_holdings_for_period(
            supabase_url,
            supabase_key,
            target_year,
            target_month,
        )
        if existing_completed_codes:
            profiles = [profile for profile in profiles if profile["fon_kodu"] not in existing_completed_codes]

    total_requested = len(profiles) + len(existing_completed_codes)
    if not profiles:
        logger.info(
            f"All {len(existing_completed_codes)} requested funds already have holdings for "
            f"{month_name(target_year, target_month)}; nothing to do.",
        )
        persist_batch(
            supabase_url,
            supabase_key,
            target_year,
            target_month,
            [],
            [],
            len(existing_completed_codes),
            existing_holding_rows,
            final=True,
            has_failures=False,
        )
        summary = {
            "target_period": month_name(target_year, target_month),
            "total_funds": total_requested,
            "already_synced_funds": len(existing_completed_codes),
            "ok_funds": len(existing_completed_codes),
            "no_stock_holdings": 0,
            "failed_funds": 0,
            "holding_rows": existing_holding_rows,
            "elapsed_seconds": 0,
        }
        logger.info(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0

    batches = chunk_profiles(profiles, args.batch_size)

    logger.info(
        f"Syncing KAP holdings for {len(profiles)} TEFAS-tradable mutual funds "
        f"for {month_name(target_year, target_month)}",
    )
    logger.info(f"[scope] latest TEFAS YAT universe contains {len(tefas_codes)} fund codes")
    if existing_completed_codes:
        logger.info(
            f"[resume] skipping {len(existing_completed_codes)} funds that already have stored holdings "
            f"for {month_name(target_year, target_month)}",
        )
    logger.info(
        f"[chunking] processing {len(batches)} batch(es) of up to {max(1, args.batch_size)} funds "
        f"with a {max(0, args.cooldown_seconds)}s cooldown between batches",
    )

    results: list[dict[str, Any]] = []
    total_completed = 0
    total_ok_funds = len(existing_completed_codes)
    total_holding_rows = existing_holding_rows
    any_failures = False

    started = time.time()
    for batch_number, batch_profiles in enumerate(batches, start=1):
        batch_results: list[dict[str, Any]] = []
        batch_holdings: list[dict[str, Any]] = []
        batch_started = time.time()
        logger.info(
            f"[batch {batch_number}/{len(batches)}] starting {len(batch_profiles)} funds",
        )

        with ThreadPoolExecutor(max_workers=max(1, args.max_workers)) as executor:
            futures = {
                executor.submit(sync_single_fund, profile, target_year, target_month, args.days): profile["fon_kodu"]
                for profile in batch_profiles
            }
            for future in as_completed(futures):
                code = futures[future]
                try:
                    result = future.result()
                except Exception as exc:  # noqa: BLE001
                    result = {"fund_code": code, "status": "error", "error": str(exc), "holdings": []}

                results.append(result)
                batch_results.append(result)
                batch_holdings.extend(result.get("holdings", []))
                total_completed += 1

                logger.info(
                    f"[{total_completed}/{len(profiles)}] [{result['fund_code']}] {result['status']}"
                    + (
                        f" rows={result.get('row_count', 0)} weight={result.get('total_weight', 0)}"
                        if result["status"] in {"ok", "no_stock_holdings"}
                        else ""
                    )
                    + (f" error={result['error']}" if result.get("error") else ""),
                )

        batch_ok_results = [result for result in batch_results if result["status"] == "ok"]
        batch_failed_results = [result for result in batch_results if result["status"] not in {"ok", "no_stock_holdings"}]
        total_ok_funds += len(batch_ok_results)
        total_holding_rows += len(batch_holdings)
        any_failures = any_failures or bool(batch_failed_results)

        if not args.dry_run:
            persist_batch(
                supabase_url,
                supabase_key,
                target_year,
                target_month,
                batch_results,
                batch_holdings,
                total_ok_funds,
                total_holding_rows,
                final=batch_number == len(batches),
                has_failures=any_failures,
            )

        logger.info(
            f"[batch {batch_number}/{len(batches)}] completed in {round(time.time() - batch_started, 2)}s"
            f" ok={len(batch_ok_results)} failed={len(batch_failed_results)} holding_rows={len(batch_holdings)}",
        )
        if batch_number < len(batches) and args.cooldown_seconds > 0:
            logger.info(
                f"[batch {batch_number}/{len(batches)}] cooling down for {args.cooldown_seconds}s",
            )
            time.sleep(args.cooldown_seconds)

    ok_results = [result for result in results if result["status"] == "ok"]
    failed_results = [result for result in results if result["status"] not in {"ok", "no_stock_holdings"}]
    elapsed = round(time.time() - started, 2)

    summary = {
        "target_period": month_name(target_year, target_month),
        "total_funds": total_requested,
        "processed_funds": len(profiles),
        "already_synced_funds": len(existing_completed_codes),
        "ok_funds": len(ok_results) + len(existing_completed_codes),
        "no_stock_holdings": len([result for result in results if result["status"] == "no_stock_holdings"]),
        "failed_funds": len(failed_results),
        "holding_rows": total_holding_rows,
        "elapsed_seconds": elapsed,
    }
    logger.info(json.dumps(summary, ensure_ascii=False, indent=2))

    return 1 if failed_results else 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        raise SystemExit(main())
    except SyncError as exc:
        logger.error(json.dumps({"error": str(exc)}, ensure_ascii=False))
        raise SystemExit(1)

"""Tefas Crawler

Crawls public investment fund information from Turkey Electronic Fund Trading Platform.
"""

import logging
import ssl
from datetime import datetime, date
from typing import Dict, List, Optional, Union

import httpx
import pandas as pd
from dateutil import parser as dateutil_parser
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)

from tefas.schema import BreakdownSchema, InfoSchema

# Configure module logger
logger = logging.getLogger(__name__)


class Crawler:
    """Fetch public fund information from ``https://fundturkey.com.tr``.

    Examples:

    >>> tefas = Crawler()
    >>> data = tefas.fetch(start="2020-11-20")
    >>> data.head(1)
           price  number_of_shares code  ... precious_metals  stock  private_sector_bond
    0  41.302235         1898223.0  AAK  ...             0.0  31.14                 3.28
    >>> data = tefas.fetch(name="YAC",
    >>>                    start="2020-11-15",
    >>>                    end="2020-11-20",
    >>>                    columns=["date", "code", "price"])
    >>> data.head()
             date code     price
    0  2020-11-20  YAC  1.844274
    1  2020-11-19  YAC  1.838618
    2  2020-11-18  YAC  1.833198
    3  2020-11-17  YAC  1.838440
    4  2020-11-16  YAC  1.827832
    """

    root_url = "https://fundturkey.com.tr"
    detail_endpoint = "/api/DB/BindHistoryAllocation"
    info_endpoint = "/api/DB/BindHistoryInfo"
    headers = {
        "Connection": "keep-alive",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Origin": "https://fundturkey.com.tr",
        "Referer": "https://fundturkey.com.tr/TarihselVeriler.aspx",
    }

    def __init__(self):
        self.client = _get_client()
        # Initial request to establish cookies
        _ = self.client.get(self.root_url)

    def fetch(
        self,
        start: Union[str, datetime, date],
        end: Optional[Union[str, datetime, date]] = None,
        name: Optional[str] = None,
        columns: Optional[List[str]] = None,
        kind: Optional[str] = "YAT",
    ) -> pd.DataFrame:
        """Main entry point of the public API. Get fund information.

        Args:
            start: The date that fund information is crawled for.
                   Accepts datetime objects, date objects, or strings in various formats
                   (e.g., "2020-11-20", "20.11.2020", "Nov 20, 2020", "20/11/2020").
            end: End of the period that fund information is crawled for. (optional)
            name: Name of the fund. If not given, all funds will be returned. (optional)
            columns: List of columns to be returned. (optional)
            kind: Type of the fund. One of `YAT`, `EMK`, or `BYF`. Defaults to `YAT`. (optional)
                - `YAT`: Securities Mutual Funds
                - `EMK`: Pension Funds
                - `BYF`: Exchange Traded Funds

        Returns:
            A pandas DataFrame where each row is the information for a fund.

        Raises:
            ValueError if date format is wrong.
        """
        if kind not in ["YAT", "EMK", "BYF"]:
            raise ValueError("`kind` should be one of `YAT`, `EMK`, or `BYF`")

        start_date = _parse_date(start)
        end_date = _parse_date(end or start)
        data = {
            "fontip": kind,
            "bastarih": start_date,
            "bittarih": end_date,
            "fonkod": name.upper() if name else "",
        }

        # General info pane
        info_schema = InfoSchema(many=True)
        info = self._do_post(self.info_endpoint, data)
        info = info_schema.load(info)
        info = pd.DataFrame(info, columns=info_schema.fields.keys())

        # Portfolio breakdown pane
        detail_schema = BreakdownSchema(many=True)
        detail = self._do_post(self.detail_endpoint, data)
        detail = detail_schema.load(detail)
        detail = pd.DataFrame(detail, columns=detail_schema.fields.keys())

        # Merge two panes
        merged = pd.merge(info, detail, on=["code", "date"])

        # Return only desired columns
        merged = merged[columns] if columns else merged

        return merged

    @retry(
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        retry=retry_if_exception_type((httpx.HTTPError, ValueError)),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    )
    def _do_post(self, endpoint: str, data: Dict[str, str]) -> Dict[str, str]:
        """Execute POST request with automatic retry on failure.

        Uses tenacity for exponential backoff retry logic.
        Retries on HTTP errors and JSON decode errors (rate limiting).
        """
        response = self.client.post(
            url=f"{self.root_url}/{endpoint}",
            data=data,
            headers=self.headers,
        )
        response.raise_for_status()
        return response.json().get("data", {})

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def close(self):
        """Close the HTTP client connection."""
        self.client.close()


def _parse_date(date_input: Union[str, datetime, date]) -> str:
    """Parse various date formats and return DD.MM.YYYY format for TEFAS API.

    Args:
        date_input: A date in various formats:
            - datetime.datetime object
            - datetime.date object
            - String in formats like:
                - "2020-11-20" (ISO format)
                - "20.11.2020" (European format)
                - "11/20/2020" (US format)
                - "Nov 20, 2020" (Human readable)
                - "20 November 2020"
                - And many more supported by dateutil

    Returns:
        Date string in DD.MM.YYYY format required by TEFAS API.

    Raises:
        ValueError: If the date cannot be parsed.
    """
    if isinstance(date_input, datetime):
        return date_input.strftime("%d.%m.%Y")
    elif isinstance(date_input, date):
        return date_input.strftime("%d.%m.%Y")
    elif isinstance(date_input, str):
        try:
            # Use dateutil for flexible parsing with dayfirst=True for European format preference
            parsed = dateutil_parser.parse(date_input, dayfirst=True)
            return parsed.strftime("%d.%m.%Y")
        except (ValueError, TypeError) as exc:
            raise ValueError(
                f"Could not parse date string '{date_input}'. "
                "Supported formats include: 'YYYY-MM-DD', 'DD.MM.YYYY', 'DD/MM/YYYY', "
                "'Month DD, YYYY', etc."
            ) from exc
    else:
        raise ValueError(
            f"`date` should be a string, datetime.datetime, or datetime.date object. "
            f"Got {type(date_input).__name__}."
        )


def _get_client() -> httpx.Client:
    """Create and return a configured httpx client.

    Uses httpx which has modern SSL/TLS defaults and handles most servers correctly.
    For legacy servers requiring unsafe renegotiation, a custom SSL context is configured.

    Returns:
        Configured httpx.Client instance.
    """
    # Create SSL context with modern defaults
    ssl_context = ssl.create_default_context()

    # Enable legacy server connect for servers that require it (like TEFAS)
    # This is safer than the old approach as we use the proper constant
    try:
        ssl_context.options |= ssl.OP_LEGACY_SERVER_CONNECT
    except AttributeError:
        # OP_LEGACY_SERVER_CONNECT may not be available on older Python/OpenSSL
        # Fall back to the numeric value (0x4) if needed
        ssl_context.options |= 0x4

    return httpx.Client(
        verify=ssl_context,
        timeout=httpx.Timeout(30.0, connect=10.0),
        follow_redirects=True,
    )

from unittest.mock import MagicMock, patch, Mock
from datetime import datetime, date

import pytest
import httpx

from tefas import Crawler
from tefas.crawler import _parse_date, _get_client


class TestParseDateFunction:
    """Test the flexible date parsing functionality"""

    def test_parse_iso_format(self):
        """Test ISO format YYYY-MM-DD"""
        result = _parse_date("2020-11-20")
        assert result == "20.11.2020"

    def test_parse_european_format(self):
        """Test European format DD.MM.YYYY"""
        result = _parse_date("20.11.2020")
        assert result == "20.11.2020"

    def test_parse_slash_format(self):
        """Test slash format DD/MM/YYYY (with dayfirst=True)"""
        result = _parse_date("20/11/2020")
        assert result == "20.11.2020"

    def test_parse_human_readable(self):
        """Test human readable format"""
        result = _parse_date("Nov 20, 2020")
        assert result == "20.11.2020"

    def test_parse_long_month_format(self):
        """Test long month format"""
        result = _parse_date("20 November 2020")
        assert result == "20.11.2020"

    def test_parse_datetime_object(self):
        """Test datetime object input"""
        dt = datetime(2020, 11, 20, 10, 30, 0)
        result = _parse_date(dt)
        assert result == "20.11.2020"

    def test_parse_date_object(self):
        """Test date object input"""
        d = date(2020, 11, 20)
        result = _parse_date(d)
        assert result == "20.11.2020"

    def test_parse_invalid_string(self):
        """Test invalid date string raises ValueError"""
        with pytest.raises(ValueError) as exc_info:
            _parse_date("not-a-date")
        assert "Could not parse date string" in str(exc_info.value)

    def test_parse_invalid_type(self):
        """Test invalid type raises ValueError"""
        with pytest.raises(ValueError) as exc_info:
            _parse_date(12345)
        assert "should be a string" in str(exc_info.value)


@pytest.fixture
def mock_client():
    """Create a mock httpx client for testing"""
    mock = MagicMock(spec=httpx.Client)
    mock.get.return_value = MagicMock(status_code=200)
    return mock


class TestCrawlerUnit:
    """Unit tests for Crawler that don't require network access"""

    @patch('tefas.crawler._get_client')
    def test_crawler_initialization(self, mock_get_client):
        """Test that Crawler initializes correctly"""
        mock_client = MagicMock(spec=httpx.Client)
        mock_client.get.return_value = MagicMock(status_code=200)
        mock_get_client.return_value = mock_client

        crawler = Crawler()
        assert crawler.client is mock_client
        mock_client.get.assert_called_once_with(Crawler.root_url)
        crawler.close()

    @patch('tefas.crawler._get_client')
    def test_crawler_context_manager(self, mock_get_client):
        """Test the Crawler can be used as a context manager"""
        mock_client = MagicMock(spec=httpx.Client)
        mock_client.get.return_value = MagicMock(status_code=200)
        mock_get_client.return_value = mock_client

        with Crawler() as crawler:
            assert crawler.client is mock_client

        mock_client.close.assert_called_once()

    @patch('tefas.crawler._get_client')
    def test_crawler_close(self, mock_get_client):
        """Test that close() closes the client"""
        mock_client = MagicMock(spec=httpx.Client)
        mock_client.get.return_value = MagicMock(status_code=200)
        mock_get_client.return_value = mock_client

        crawler = Crawler()
        crawler.close()
        mock_client.close.assert_called_once()

    @patch('tefas.crawler._get_client')
    def test_empty_result(self, mock_get_client):
        """Test the client when POST to tefas returns empty list"""
        mock_client = MagicMock(spec=httpx.Client)
        mock_client.get.return_value = MagicMock(status_code=200)
        mock_response = MagicMock()
        mock_response.json.return_value = {"data": []}
        mock_response.raise_for_status = MagicMock()
        mock_client.post.return_value = mock_response
        mock_get_client.return_value = mock_client

        crawler = Crawler()
        df = crawler.fetch(start="2020-11-20")
        assert len(df) == 0
        crawler.close()

    @patch('tefas.crawler._get_client')
    def test_invalid_kind_raises_error(self, mock_get_client):
        """Test that invalid kind parameter raises ValueError"""
        mock_client = MagicMock(spec=httpx.Client)
        mock_client.get.return_value = MagicMock(status_code=200)
        mock_get_client.return_value = mock_client

        crawler = Crawler()
        with pytest.raises(ValueError) as exc_info:
            crawler.fetch(start="2020-11-20", kind="INVALID")
        assert "`kind` should be one of" in str(exc_info.value)
        crawler.close()


class TestGetClient:
    """Test the _get_client function"""

    def test_get_client_returns_httpx_client(self):
        """Test that _get_client returns an httpx Client"""
        client = _get_client()
        assert isinstance(client, httpx.Client)
        client.close()

    def test_get_client_has_timeout(self):
        """Test that client has proper timeout configured"""
        client = _get_client()
        assert client.timeout.connect == 10.0
        assert client.timeout.read == 30.0
        client.close()

    def test_get_client_follows_redirects(self):
        """Test that client is configured to follow redirects"""
        client = _get_client()
        assert client.follow_redirects is True
        client.close()


class TestCrawlerIntegration:
    """Integration tests that require network access - skipped by default"""

    @pytest.mark.skip(reason="Requires network access to TEFAS servers")
    def test_fetch_real_data(self):
        """Test fetching real data from TEFAS"""
        with Crawler() as crawler:
            df = crawler.fetch(start="2020-11-20")
            assert len(df) > 0
            assert "code" in df.columns
            assert "date" in df.columns
            assert "price" in df.columns

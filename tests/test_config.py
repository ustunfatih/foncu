
import sys
import subprocess
import os
from unittest import mock
import pytest
from tefas import Crawler

class TestCrawlerConfig:
    def test_init_override(self):
        """Test overriding root_url in __init__"""
        custom_url = "https://example.com"
        # We need to mock _get_client because __init__ calls it
        with mock.patch('tefas.crawler._get_client') as mock_get_client:
            mock_client = mock.Mock()
            mock_get_client.return_value = mock_client

            crawler = Crawler(root_url=custom_url)
            assert crawler.root_url == custom_url
            mock_client.get.assert_called_with(custom_url)

    def test_env_var_override(self):
        """Test that TEFAS_ROOT_URL environment variable overrides the default root_url"""
        env = os.environ.copy()
        custom_url = "https://env-override.com"
        env["TEFAS_ROOT_URL"] = custom_url

        code = """
import os
from tefas import Crawler
print(Crawler.root_url)
"""
        result = subprocess.run(
            [sys.executable, "-c", code],
            env=env,
            capture_output=True,
            text=True,
            check=True
        )
        assert result.stdout.strip() == custom_url

    def test_default_url(self):
        """Test that default root_url is used when env var is not set"""
        env = os.environ.copy()
        if "TEFAS_ROOT_URL" in env:
            del env["TEFAS_ROOT_URL"]

        code = """
from tefas import Crawler
print(Crawler.root_url)
"""
        result = subprocess.run(
            [sys.executable, "-c", code],
            env=env,
            capture_output=True,
            text=True,
            check=True
        )
        assert result.stdout.strip() == "https://fundturkey.com.tr"

from datetime import date
from tefas.schema import TarihConversionMixin

class TestTarihConversion:
    """Test TarihConversionMixin.pre_load_hook for all scenarios"""

    def test_pre_load_hook_missing_tarih(self):
        """Test with TARIH field missing"""
        mixin = TarihConversionMixin()
        input_data = {"OTHER": "value"}
        result = mixin.pre_load_hook(input_data.copy())
        assert result == input_data

    def test_pre_load_hook_none_tarih(self):
        """Test with TARIH field as None"""
        mixin = TarihConversionMixin()
        input_data = {"TARIH": None}
        result = mixin.pre_load_hook(input_data.copy())
        assert result == input_data

    def test_pre_load_hook_zero_tarih(self):
        """Test with TARIH field as 0"""
        mixin = TarihConversionMixin()
        input_data = {"TARIH": 0}
        result = mixin.pre_load_hook(input_data.copy())
        assert result == input_data

    def test_pre_load_hook_negative_tarih(self):
        """Test with TARIH field as negative value"""
        mixin = TarihConversionMixin()
        input_data = {"TARIH": -1000}
        result = mixin.pre_load_hook(input_data.copy())
        assert result == input_data

    def test_pre_load_hook_value_error(self):
        """Test with TARIH field as invalid string (ValueError)"""
        mixin = TarihConversionMixin()
        input_data = {"TARIH": "invalid"}
        result = mixin.pre_load_hook(input_data.copy())
        assert result == input_data

    def test_pre_load_hook_type_error(self):
        """Test with TARIH field as invalid type (TypeError)"""
        mixin = TarihConversionMixin()
        input_data = {"TARIH": []}
        result = mixin.pre_load_hook(input_data.copy())
        assert result == input_data

    def test_pre_load_hook_os_error(self):
        """Test with TARIH field causing OSError in date.fromtimestamp"""
        mixin = TarihConversionMixin()
        # A very large timestamp that causes OSError in date.fromtimestamp
        input_data = {"TARIH": 2**60}
        result = mixin.pre_load_hook(input_data.copy())
        assert result == input_data

    def test_pre_load_hook_success(self):
        """Test successful conversion (Happy path)"""
        mixin = TarihConversionMixin()
        # 2020-11-20 00:00:00 UTC
        timestamp_ms = 1605830400000
        input_data = {"TARIH": timestamp_ms}
        result = mixin.pre_load_hook(input_data.copy())

        # Use date.fromtimestamp to match the implementation's behavior (local time)
        # to avoid timezone-related flakiness in tests.
        expected_date = date.fromtimestamp(timestamp_ms / 1000).isoformat()
        assert result["TARIH"] == expected_date

"""Data schema validation"""

from tefas.schema import InfoSchema, BreakdownSchema


class TestSchemaFields:
    """Test that schemas have the expected fields"""

    def test_info_schema_fields(self):
        """Test InfoSchema has all required fields"""
        schema = InfoSchema()
        expected_fields = {
            "date", "price", "code", "title",
            "market_cap", "number_of_shares", "number_of_investors"
        }
        assert set(schema.fields.keys()) == expected_fields

    def test_breakdown_schema_fields(self):
        """Test BreakdownSchema has all portfolio breakdown fields"""
        schema = BreakdownSchema()
        # Check some key fields are present
        assert "code" in schema.fields
        assert "date" in schema.fields
        assert "stock" in schema.fields
        assert "government_bond" in schema.fields
        assert "precious_metals" in schema.fields
        assert "term_deposit" in schema.fields

    def test_all_fields_union(self):
        """Test that both schemas have code and date for merging"""
        info_fields = set(InfoSchema().fields.keys())
        breakdown_fields = set(BreakdownSchema().fields.keys())

        # Both should have code and date for merging
        assert "code" in info_fields
        assert "date" in info_fields
        assert "code" in breakdown_fields
        assert "date" in breakdown_fields


class TestSchemaDataTransforms:
    """Test schema data transformation hooks"""

    def test_info_schema_timestamp_conversion(self):
        """Test that InfoSchema converts Unix timestamp to date"""
        schema = InfoSchema()
        # Unix timestamp in milliseconds (2020-11-20)
        input_data = {
            "TARIH": 1605830400000,  # 2020-11-20 00:00:00 UTC
            "FIYAT": 41.302235,
            "FONKODU": "AAK",
            "FONUNVAN": "Test Fund",
            "PORTFOYBUYUKLUK": 1000000.0,
            "TEDPAYSAYISI": 1898223.0,
            "KISISAYISI": 500.0
        }
        result = schema.load(input_data)
        assert result["code"] == "AAK"
        assert result["price"] == 41.302235
        assert result["date"] is not None

    def test_breakdown_schema_null_handling(self):
        """Test that BreakdownSchema replaces None with 0.0 for float fields"""
        schema = BreakdownSchema()
        input_data = {
            "TARIH": 1605830400000,
            "FONKODU": "AAK",
            "HS": None,  # stock field is None
            "DT": 10.5,  # government_bond has value
        }
        result = schema.load(input_data)
        assert result["stock"] == 0.0  # None should become 0.0
        assert result["government_bond"] == 10.5

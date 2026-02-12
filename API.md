# TEFAS Fund Dashboard - API Documentation

Complete API reference for the TEFAS Fund Dashboard backend services.

## 🌐 Base URL

**Production**: `https://your-vercel-app.vercel.app/api`

**Local Development**: `http://localhost:3000/api`

## 📋 Authentication

Most endpoints are **public** and do not require authentication.

**Portfolio endpoints** require GitHub OAuth authentication via Supabase Auth.

---

## 📊 Endpoints

### 1. List Available Funds

**Endpoint**: `GET /api/funds`

Returns a list of available investment funds filtered by type.

#### Query Parameters

| Parameter | Type   | Required | Description                                      |
|-----------|--------|----------|--------------------------------------------------|
| `kind`    | string | No       | Fund type: `YAT`, `EMK`, or `BYF` (default: `YAT`) |

#### Example Request

```bash
curl "https://your-app.vercel.app/api/funds?kind=YAT"
```

#### Example Response (200 OK)

```json
{
  "funds": [
    {
      "code": "AAK",
      "title": "Ahlatcı Yatırım Karma Fon",
      "kind": "YAT",
      "latestDate": "2024-01-15"
    },
    {
      "code": "AAL",
      "title": "Ahlatcı Hisse Senedi Fonu",
      "kind": "YAT",
      "latestDate": "2024-01-15"
    }
  ],
  "count": 2
}
```

#### Error Responses

| Status | Description |
|--------|-------------|
| 400    | Invalid fund kind parameter |
| 500    | Database error |

---

### 2. Get Fund History

**Endpoint**: `GET /api/fund-history`

Retrieves historical data (price, market cap, investor count) for a specific fund.

#### Query Parameters

| Parameter | Type   | Required | Description                                      |
|-----------|--------|----------|--------------------------------------------------|
| `code`    | string | Yes      | Fund code (e.g., `AAK`)                          |
| `kind`    | string | No       | Fund type: `YAT`, `EMK`, or `BYF` (default: `YAT`) |
| `days`    | number | No       | Number of days of history (default: 90)          |

#### Example Request

```bash
curl "https://your-app.vercel.app/api/fund-history?code=AAK&kind=YAT&days=30"
```

#### Example Response (200 OK)

```json
{
  "code": "AAK",
  "title": "Ahlatcı Yatırım Karma Fon",
  "kind": "YAT",
  "priceHistory": [
    {
      "date": "2024-01-15",
      "value": 41.302235
    },
    {
      "date": "2024-01-14",
      "value": 41.155123
    }
  ],
  "marketCapHistory": [
    {
      "date": "2024-01-15",
      "value": 1898223.0
    }
  ],
  "investorHistory": [
    {
      "date": "2024-01-15",
      "value": 15234
    }
  ]
}
```

#### Error Responses

| Status | Description                |
|--------|----------------------------|
| 400    | Missing fund code          |
| 404    | Fund not found             |
| 500    | Database or crawler error  |

---

### 3. Fund Risk Metrics

**Endpoint**: `GET /api/fund-risk`

Calculates risk metrics (Sharpe ratio, volatility, max drawdown) for a fund.

#### Query Parameters

| Parameter | Type   | Required | Description                                      |
|-----------|--------|----------|--------------------------------------------------|
| `code`    | string | Yes      | Fund code                                        |
| `kind`    | string | No       | Fund type: `YAT`, `EMK`, or `BYF` (default: `YAT`) |
| `days`    | number | No       | Analysis period in days (default: 365)           |

#### Example Request

```bash
curl "https://your-app.vercel.app/api/fund-risk?code=AAK&days=365"
```

#### Example Response (200 OK)

```json
{
  "code": "AAK",
  "metrics": {
    "sharpeRatio": 1.45,
    "volatility": 0.1234,
    "maxDrawdown": -0.0891
  },
  "period": "365 days",
  "dataPoints": 250
}
```

---

### 4. Fund Screener

**Endpoint**: `POST /api/fund-screen`

Screens and filters funds based on various criteria.

#### Request Body

```json
{
  "kind": "YAT",
  "filters": {
    "minPrice": 10.0,
    "maxPrice": 100.0,
    "minMarketCap": 1000000,
    "minSharpeRatio": 1.0
  },
  "sortBy": "sharpeRatio",
  "sortOrder": "desc",
  "limit": 50
}
```

#### Example Request

```bash
curl -X POST "https://your-app.vercel.app/api/fund-screen" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "YAT",
    "filters": {
      "minSharpeRatio": 1.5
    },
    "sortBy": "sharpeRatio",
    "sortOrder": "desc"
  }'
```

#### Example Response (200 OK)

```json
{
  "funds": [
    {
      "code": "ABC",
      "title": "Örnek Fon",
      "metrics": {
        "sharpeRatio": 2.1,
        "volatility": 0.15
      }
    }
  ],
  "total": 1,
  "filters": {
    "minSharpeRatio": 1.5
  }
}
```

---

### 5. Technical Scanner

**Endpoint**: `POST /api/fund-technical-scan`

Scans funds for technical analysis patterns.

#### Request Body

```json
{
  "kind": "YAT",
  "patterns": ["golden_cross", "oversold"],
  "timeframe": "1M"
}
```

#### Example Request

```bash
curl -X POST "https://your-app.vercel.app/api/fund-technical-scan" \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "YAT",
    "patterns": ["golden_cross"]
  }'
```

#### Example Response (200 OK)

```json
{
  "matches": [
    {
      "code": "AAK",
      "title": "Ahlatcı Yatırım Karma Fon",
      "pattern": "golden_cross",
      "signal": "bullish",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ],
  "scanned": 250,
  "matches": 15
}
```

---

### 6. Macroeconomic Series

**Endpoint**: `GET /api/macro-series`

Retrieves macroeconomic indicator time series data.

#### Query Parameters

| Parameter | Type   | Required | Description                                      |
|-----------|--------|----------|--------------------------------------------------|
| `indicator` | string | Yes    | Indicator code: `inflation`, `interest_rate`, `exchange_rate` |
| `days`    | number | No       | Number of days (default: 365)                    |

#### Example Request

```bash
curl "https://your-app.vercel.app/api/macro-series?indicator=inflation&days=365"
```

#### Example Response (200 OK)

```json
{
  "indicator": "inflation",
  "unit": "percent",
  "data": [
    {
      "date": "2024-01-01",
      "value": 64.77
    },
    {
      "date": "2023-12-01",
      "value": 61.98
    }
  ],
  "source": "TURKSTAT"
}
```

---

### 7. Market Events

**Endpoint**: `GET /api/market-events`

Returns important market events and calendar data.

#### Query Parameters

| Parameter | Type   | Required | Description                                      |
|-----------|--------|----------|--------------------------------------------------|
| `from`    | date   | No       | Start date (YYYY-MM-DD)                          |
| `to`      | date   | No       | End date (YYYY-MM-DD)                            |

#### Example Request

```bash
curl "https://your-app.vercel.app/api/market-events?from=2024-01-01&to=2024-01-31"
```

#### Example Response (200 OK)

```json
{
  "events": [
    {
      "date": "2024-01-15",
      "title": "TCMB Faiz Kararı",
      "type": "monetary_policy",
      "impact": "high"
    },
    {
      "date": "2024-01-20",
      "title": "Enflasyon Verisi Açıklanacak",
      "type": "economic_data",
      "impact": "high"
    }
  ]
}
```

---

### 8. Portfolio Valuation

**Endpoint**: `POST /api/portfolio-valuation`

Calculates portfolio value, allocation, and performance metrics.

#### Request Body

```json
{
  "holdings": [
    {
      "code": "AAK",
      "shares": 1000
    },
    {
      "code": "AAL",
      "shares": 500
    }
  ],
  "date": "2024-01-15"
}
```

#### Example Request

```bash
curl -X POST "https://your-app.vercel.app/api/portfolio-valuation" \
  -H "Content-Type: application/json" \
  -d '{
    "holdings": [
      {"code": "AAK", "shares": 1000},
      {"code": "AAL", "shares": 500}
    ]
  }'
```

#### Example Response (200 OK)

```json
{
  "totalValue": 65892.34,
  "currency": "TRY",
  "holdings": [
    {
      "code": "AAK",
      "shares": 1000,
      "price": 41.30,
      "value": 41300.00,
      "allocation": 62.68
    },
    {
      "code": "AAL",
      "shares": 500,
      "price": 49.18,
      "value": 24592.34,
      "allocation": 37.32
    }
  ],
  "date": "2024-01-15"
}
```

---

## 📊 Common Data Types

### FundKind

Enum values for fund types:

- `YAT` - Yatırım Fonları (Securities Mutual Funds)
- `EMK` - Emeklilik Fonları (Pension Funds)
- `BYF` - Borsa Yatırım Fonları (Exchange Traded Funds)

### HistoricalPoint

```typescript
{
  date: string;      // ISO 8601 date (YYYY-MM-DD)
  value: number;     // Numeric value
}
```

### FundOverview

```typescript
{
  code: string;
  title: string;
  kind: FundKind;
  priceHistory?: HistoricalPoint[];
  marketCapHistory?: HistoricalPoint[];
  investorHistory?: HistoricalPoint[];
}
```

---

## ❌ Error Handling

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description",
    "details": {}
  }
}
```

### Common Error Codes

| Code                | HTTP Status | Description                           |
|---------------------|-------------|---------------------------------------|
| `INVALID_PARAM`     | 400         | Invalid or missing parameter          |
| `FUND_NOT_FOUND`    | 404         | Fund code not found                   |
| `DB_ERROR`          | 500         | Database connection/query error       |
| `CRAWLER_ERROR`     | 500         | TEFAS crawler failed                  |
| `RATE_LIMIT`        | 429         | Too many requests                     |

---

## 📈 Rate Limiting

- **Default**: 100 requests per minute per IP
- **Burst**: 20 requests per second

Rate limit headers included in all responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

---

## 🧪 Testing Examples

### Using curl

```bash
# Get all YAT funds
curl -s "https://your-app.vercel.app/api/funds?kind=YAT" | jq '.funds[0:3]'

# Get fund history for last 7 days
curl -s "https://your-app.vercel.app/api/fund-history?code=AAK&days=7" | jq

# Screen funds with high Sharpe ratio
curl -s -X POST "https://your-app.vercel.app/api/fund-screen" \
  -H "Content-Type: application/json" \
  -d '{"kind":"YAT","filters":{"minSharpeRatio":1.5}}' | jq
```

### Using JavaScript (Fetch)

```javascript
// Get fund history
const response = await fetch(
  '/api/fund-history?code=AAK&kind=YAT&days=30'
);
const data = await response.json();
console.log(data.priceHistory);

// Screen funds
const screenResponse = await fetch('/api/fund-screen', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    kind: 'YAT',
    filters: { minSharpeRatio: 1.5 },
    sortBy: 'sharpeRatio'
  })
});
const results = await screenResponse.json();
```

---

## 📚 Additional Resources

- [Architecture Documentation](./ARCHITECTURE.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Frontend Documentation](./frontend/README.md)

---

## 📝 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for API version history.

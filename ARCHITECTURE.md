# TEFAS Fund Dashboard - Architecture Documentation

This document provides an overview of the system architecture, data flow, and component relationships for the TEFAS Fund Dashboard application.

## 📐 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Frontend   │  │   Mobile     │  │    CLI       │           │
│  │   (React)    │  │   (React)    │  │   (Python)   │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          └────────────────┴────────────────┘
                           │
                    HTTP/WebSocket
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│                         API LAYER                               │
│  ┌───────────────────────┴──────────────────────┐               │
│  │          Vercel Serverless Functions         │               │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐     │               │
│  │  │ /funds   │ │ /history │ │ /screen  │ ... │               │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘     │               │
│  └───────┼────────────┼────────────┼────────────┘               │
└──────────┼────────────┼────────────┼────────────────────────────┘
           │            │            │
           └────────────┴────────────┘
                        │
              ┌─────────┴──────────┐
              │                    │
┌─────────────▼────────┐  ┌────────▼─────────────┐
│     DATA SOURCES     │  │     DATABASE         │
│  ┌────────────────┐  │  │  ┌────────────────┐  │
│  │ fundturkey.com │  │  │  │   Supabase     │  │
│  │ (TEFAS Crawler)│  │  │  │  (PostgreSQL)  │  │
│  └────────────────┘  │  │  └────────────────┘  │
└──────────────────────┘  └──────────────────────┘
```

## 🏗️ Component Architecture

### Frontend (React + TypeScript)

```
src/
├── components/          # Reusable UI components
│   ├── FundCard.tsx          # Individual fund display card
│   ├── FundSelector.tsx      # Fund search & selection dropdown
│   ├── PerformanceChart.tsx  # Main chart with Recharts
│   ├── AllocationChart.tsx   # Portfolio allocation pie chart
│   ├── MetricCard.tsx        # Metric display cards
│   ├── LoadingSkeleton.tsx   # Loading states
│   ├── FundInsights.tsx      # Fund analytics display
│   └── ErrorBoundary.tsx     # Error handling wrapper
│
├── pages/               # Route-level page components
│   ├── PortfolioPage.tsx     # Portfolio management
│   ├── BenchmarkPage.tsx     # Fund benchmarking
│   ├── FundScreenerPage.tsx  # Fund filtering/screening
│   ├── TechnicalScannerPage.tsx  # Technical analysis
│   ├── MacroPage.tsx         # Macroeconomic data
│   ├── EventsPage.tsx        # Market events calendar
│   └── ExportPage.tsx        # Data export (CSV, Excel, PDF)
│
├── context/             # React context providers
│   └── AuthContext.tsx       # Authentication state (GitHub OAuth)
│
├── hooks/               # Custom React hooks
│   └── useFundSearch.ts      # Fund search logic
│
├── lib/                 # External library configurations
│   └── supabase.ts           # Supabase client setup
│
├── utils/               # Utility functions
│   ├── analytics.ts          # Financial calculations
│   └── format.ts             # Number/currency formatting
│
├── api.ts               # API client functions
├── types.ts             # TypeScript type definitions
├── App.tsx              # Main app component with routing
└── main.tsx             # Entry point
```

### API Layer (Vercel Serverless Functions)

```
api/
├── _lib/                      # Shared API libraries
│   ├── tefas.js              # TEFAS API interaction
│   ├── supabase.js           # Database client
│   ├── analytics.js          # Analytics calculations
│   ├── history.js            # Historical data processing
│   ├── nonTefasFunds.json    # Non-TEFAS fund mappings
│   └── market-events.json    # Market events data
│
├── funds.js                   # GET /api/funds - List available funds
├── fund-history.js            # GET /api/fund-history - Historical data
├── fund-risk.js               # GET /api/fund-risk - Risk metrics
├── fund-screen.js             # POST /api/fund-screen - Fund screening
├── fund-technical-scan.js     # POST /api/fund-technical-scan - Technical analysis
├── macro-series.js            # GET /api/macro-series - Macroeconomic data
├── market-events.js           # GET /api/market-events - Market events
└── portfolio-valuation.js     # POST /api/portfolio-valuation - Portfolio calculations
```

### Python Crawler

```
tefas/
├── __init__.py               # Package initialization, version info
├── crawler.py                # Main Crawler class
│   ├── Crawler.fetch()       # Main entry point
│   ├── Crawler._do_post()    # HTTP requests with retry logic
│   └── _get_client()         # HTTP client with SSL config
└── schema.py                 # Marshmallow schemas for validation
    ├── InfoSchema            # General fund info validation
    └── BreakdownSchema       # Portfolio breakdown validation
```

## 🔄 Data Flow

### 1. Fund Selection & Display Flow

```
User selects fund from dropdown
        │
        ▼
FundSelector component
        │
        ▼
useFundSearch hook (filters funds)
        │
        ▼
User clicks fund
        │
        ▼
handleFundSelect in App.tsx
        │
        ├──────────────────┐
        ▼                  ▼
selectedCodes state    fetchFundDetails API call
        │                  │
        ▼                  ▼
FundCard components    Fund data enrichment
(visualization)              │
                              ▼
                        PerformanceChart
                        (Recharts visualization)
```

### 2. Portfolio Save/Load Flow

```
User clicks "Kaydet" (Save)
        │
        ▼
savePortfolio in App.tsx
        │
        ▼
supabase.from('portfolios').upsert()
        │
        ▼
PostgreSQL (portfolios table)
        │
        ▼
Success: alert('Portföy kaydedildi!')

────────────────────────────────────

User logs in
        │
        ▼
useEffect in App.tsx
        │
        ▼
supabase.from('portfolios').select()
        │
        ▼
setSelectedCodes(data.fund_list)
        │
        ▼
Load fund details & display
```

### 3. Data Export Flow

```
User configures export
(Select funds, date range, columns, format)
        │
        ▼
Clicks "Export" button
        │
        ▼
exportData in ExportPage.tsx
        │
        ├────────────────────────────────┐
        ▼                                ▼
   Format = CSV                    Format = Excel
        │                                │
        ▼                                ▼
   exportCSV()                     exportExcel()
   (CSV string                     (XLSX library)
    construction)                         │
        │                                ▼
        ▼                           XLSX.writeFile()
   sanitizeCSV()                        │
   (Security)                           ▼
        │                           Auto-download
        ▼
   downloadFile()
   (Blob & URL.createObjectURL)
        │
        ▼
   Auto-download to user
```

## 🗄️ Database Schema

### PostgreSQL (Supabase)

```sql
-- Funds metadata table
CREATE TABLE funds (
    code TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,        -- YAT, EMK, or BYF
    latest_date DATE
);

-- Historical price/investor data
CREATE TABLE historical_data (
    id BIGSERIAL PRIMARY KEY,
    fund_code TEXT REFERENCES funds(code),
    date DATE NOT NULL,
    price NUMERIC,
    market_cap NUMERIC,
    investor_count NUMERIC,
    UNIQUE(fund_code, date)
);

-- User portfolios (requires auth)
CREATE TABLE portfolios (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    name TEXT NOT NULL,
    fund_list JSONB NOT NULL,  -- Array of {code, kind} objects
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- Row Level Security (RLS) policies
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own portfolios"
    ON portfolios
    FOR ALL
    USING (auth.uid() = user_id);
```

## 🔐 Security Architecture

### Authentication Flow

```
User clicks "GitHub ile Giriş"
        │
        ▼
supabase.auth.signInWithOAuth({ provider: 'github' })
        │
        ▼
GitHub OAuth popup
        │
        ▼
User authorizes app
        │
        ▼
Supabase receives GitHub token
        │
        ├─────────────────────────┐
        ▼                         ▼
   Create user session      Redirect to app
   (JWT token)                   │
        │                        ▼
        │                  AuthContext updates
        │                  (user state)
        │                        │
        └────────────────────────┘
                   ▼
            Protected features
            (save portfolio, etc.)
```

### Security Measures

1. **Environment Variables**: All secrets in `.env` (not committed)
2. **Row Level Security**: Users can only access their own portfolios
3. **CSP Headers**: Content Security Policy prevents XSS
4. **Input Sanitization**: CSV export sanitizes formula-injection attempts
5. **Service Role Key**: Only used server-side, never exposed to client

## 📊 State Management

### React Context (Auth)

```typescript
// AuthContext.tsx
interface AuthContextType {
  user: User | null;           // Current authenticated user
  signInWithGithub: () => void;
  signOut: () => void;
}
```

### Local State (App.tsx)

```typescript
// Main application state
const [activeTab, setActiveTab] = useState('home');
const [fundKind, setFundKind] = useState<FundKind>('YAT');
const [selectedCodes, setSelectedCodes] = useState<Array<{code: string; kind: FundKind}>>([]);
const [selectedFunds, setSelectedFunds] = useState<FundOverview[]>([]);
const [activeTimeFilter, setActiveTimeFilter] = useState(timeFilters[3]);
const [activeMetric, setActiveMetric] = useState(metricFilters[0]);
```

## 🚀 Deployment Architecture

### Vercel Deployment

```
GitHub Repository
        │
        ▼ (Push to main branch)
   Vercel Build
        │
        ├──────────────────────────────┐
        ▼                              ▼
   Frontend Build               API Functions
   (npm run build)              (Vercel Serverless)
        │                              │
        ▼                              ▼
   Static Files (dist/)         Node.js Functions
   ┌──────────────┐             ┌──────────────┐
   │  index.html  │             │  /api/funds  │
   │  assets/     │             │  /api/history│
   └──────────────┘             └──────────────┘
        │                              │
        └──────────────┬───────────────┘
                       ▼
              Vercel CDN/Edge Network
                       │
                       ▼
                  End Users
```

## 📈 Performance Optimizations

1. **Code Splitting**: Each page component loaded on demand
2. **Memoization**: `useMemo` for expensive calculations (chart data)
3. **Lazy Loading**: Fund details fetched only when selected
4. **Caching**: Browser caching for fund lists
5. **Debouncing**: Search input debounced in FundSelector

## 🔧 Development Workflow

```
Developer makes changes
        │
        ▼
   Pre-commit hooks
        │
        ├─────────────────────────┐
        ▼                         ▼
   Linting (ESLint)         Formatting (Prettier)
   Python (flake8/pylint)   Python (black)
        │                         │
        └──────────┬──────────────┘
                   ▼
            Tests (Jest/pytest)
                   │
                   ▼
            Git commit
                   │
                   ▼
            GitHub Actions CI
                   │
                   ├─────────────────┐
                   ▼                 ▼
              Test Suite        Build Verification
                   │                 │
                   └────────┬────────┘
                            ▼
                      Deploy to Vercel
```

## 📚 Additional Resources

- [Frontend README](./frontend/README.md)
- [API Documentation](./API.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Setup Instructions](./docs/SETUP.md)

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and contribution guidelines.

## 📝 License

MIT License - See [LICENSE](./LICENSE) file

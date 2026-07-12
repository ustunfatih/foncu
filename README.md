# TEFAS Fund Dashboard

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Interactive performance tracking dashboard for Turkish investment funds (TEFAS). Built with React, Express.js, and Supabase.

## 🚀 Features

### Core Functionality
- **Multi-Fund Comparison**: Track up to 5 funds simultaneously
- **Interactive Charts**: Recharts-powered visualizations with tooltips
- **Time Periods**: 1D, 1W, 1M, 3M, 6M, YBB, 1Y, 3Y, 5Y
- **Metrics**: Price, Market Cap, Investor Count
- **Fund Types**: YAT (Investment Funds), EMK (Pension Funds), BYF (ETFs)

### Advanced Features
- **📊 Technical Indicators**: MA50 and MA200 moving averages
- **📈 Percentage Normalization**: Compare funds with different price scales
- **💾 Supabase Caching**: 15-30x faster load times for historical data
- **🔐 GitHub Authentication**: Save and sync your fund portfolios
- **🔄 Manual Refresh**: Force update data from TEFAS

### Performance
- **First Load**: 10-15 seconds (fetches from TEFAS + caches to Supabase)
- **Cached Load**: <1 second (serves from Supabase)
- **Multi-Fund**: Parallel loading for optimal performance

## 🛠️ Tech Stack

### Frontend
- **React** + **TypeScript**
- **Vite** (build tool)
- **Recharts** (charting library)
- **Supabase Client** (auth + database)

### Backend
- **Express.js** (API server)
- **Supabase** (PostgreSQL database + auth)
- **TEFAS Crawler** (Python library for data fetching)

## 📦 Installation

### Prerequisites
- Node.js 18+
- Python 3.8+
- Supabase account

### 1. Clone the repository
```bash
git clone https://github.com/ustunfatih/foncu.git
cd foncu
```

### 2. Install dependencies
```bash
# Backend
npm ci

# Frontend
cd frontend
npm ci
cd ..
```

### 3. Setup environment variables

Create `.env` in the root directory:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
CRON_SECRET=at_least_16_random_characters
```

### 4. Setup Supabase database

Apply every file in `supabase/migrations/` in timestamp order. Do not use the legacy root `supabase-schema.sql` as the schema source of truth. Then run `npm run verify:config -- --production` and check `/api/health`.

### 5. Configure authentication (optional)

1. Go to Supabase Dashboard → Authentication → Providers
2. Keep email Magic Links enabled and enable Google for the primary retail sign-in flow.
3. Add local, preview, and production `/auth/callback` URLs to the redirect allowlist.
4. Optionally enable GitHub as a secondary provider.

## 🚀 Development

```bash
# Start both backend and frontend
npm run dev

# Or separately:
# Backend (port 3000)
node scripts/dev-server.js

# Frontend (port 5173)
cd frontend && npm run dev
```

Visit http://localhost:5173

## 📤 Deployment (Vercel)

### 1. Push to GitHub
```bash
git add .
git commit -m "Add Supabase integration and advanced features"
git push origin main
```

### 2. Deploy to Vercel
1. Import your GitHub repository
2. Framework Preset: **Vite**
3. Root Directory: repository root
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`

### 3. Configure Serverless Functions
The `api/` directory will be automatically deployed as Vercel Serverless Functions.

## 📊 API Endpoints

### `GET /api/funds?kind={YAT|EMK|BYF}`
Returns list of available funds for the specified type.

### `GET /api/fund-history?code={FUND_CODE}&kind={KIND}&days={DAYS}`
Returns historical data for a specific fund.

### `GET /api/health`
Returns database reachability and fund-profile freshness without exposing credentials.

**Parameters:**
- `code`: Fund code (e.g., TLY, AAK)
- `kind`: Fund type (YAT, EMK, BYF)
- `days`: Number of days or 'ybb' for year-to-date

### `GET|POST /api/sync-fintables?phase={PHASE}`
Triggers a protected Fintables sync phase for operational refresh jobs.

Send `Authorization: Bearer <CRON_SECRET>`. Query-string secrets are rejected.

**Supported phases in Vercel runtime:** `all`, `daily`, `profiles`, `metrics`, `events`  
**Unsupported in Vercel runtime:** `holdings` (returns a clear `501` response and does not start sync work).

Monthly holdings are synchronized outside Vercel via:

```bash
python scripts/sync_kap_holdings.py
```

Use the GitHub Actions workflow that runs `scripts/sync_kap_holdings.py` for production holdings refreshes.

## 🎯 Usage

1. **Select Fund Type**: Choose between YAT, EMK, or BYF
2. **Search Funds**: Type to filter the fund list
3. **Select Funds**: Click to add (max 5 funds)
4. **Choose Time Period**: Select from 1D to 5Y
5. **Select Metric**: Price, Market Cap, or Investor Count
6. **Enable Features**:
   - Toggle "Percentage Change (%)" for normalized comparison
   - Toggle "Moving Averages" to show MA50/MA200
7. **Save Portfolio**: Login with GitHub and click "💾 Kaydet"

## 🔧 Configuration

### Cache Settings
Edit `api/fund-history.js` to adjust cache validation:
- `expectedDays`: Trading days estimation
- `coversFullRange`: Date range tolerance (default: 7 days)
- `isFresh`: Freshness threshold (default: 2 days)

### Chart Colors
Edit `frontend/src/components/PerformanceChart.tsx`:
```typescript
const colors = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea'];
const maColors = { MA50: '#f97316', MA200: '#22c55e' };
```

## 📝 License

[MIT](LICENSE)

## 🙏 Acknowledgments

- TEFAS API for providing fund data
- [tefas-crawler](https://github.com/burakyilmaz321/tefas-crawler) Python library
- Supabase for database and authentication
- Recharts for beautiful charts

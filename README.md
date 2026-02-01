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
git clone https://github.com/yourusername/tefas-crawler.git
cd tefas-crawler
```

### 2. Install dependencies
```bash
# Backend
npm install

# Frontend
cd frontend
npm install
cd ..
```

### 3. Setup environment variables

Create `.env` in the root directory:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Create `frontend/.env`:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 4. Setup Supabase database

Run this SQL in your Supabase SQL Editor:

```sql
-- Fund metadata
CREATE TABLE funds (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  latest_date DATE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Historical price/investor/market cap data
CREATE TABLE historical_data (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fund_code TEXT REFERENCES funds(code),
  date DATE NOT NULL,
  price NUMERIC,
  market_cap NUMERIC,
  investor_count INTEGER,
  UNIQUE(fund_code, date)
);

-- User portfolios
CREATE TABLE portfolios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  name TEXT DEFAULT 'My Portfolio',
  fund_list JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 5. Enable GitHub OAuth (optional)

1. Go to Supabase Dashboard → Authentication → Providers
2. Enable GitHub provider
3. Create GitHub OAuth App at https://github.com/settings/developers
4. Set callback URL: `https://your-project.supabase.co/auth/v1/callback`
5. Copy Client ID and Secret to Supabase

## 🚀 Development

```bash
# Start both backend and frontend
npm run dev

# Or separately:
# Backend (port 3000)
node dev-server.js

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
3. Root Directory: `frontend`
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

### 3. Configure Serverless Functions
The `api/` directory will be automatically deployed as Vercel Serverless Functions.

## 📊 API Endpoints

### `GET /api/funds?kind={YAT|EMK|BYF}`
Returns list of available funds for the specified type.

### `GET /api/fund-history?code={FUND_CODE}&kind={KIND}&days={DAYS}`
Returns historical data for a specific fund.

**Parameters:**
- `code`: Fund code (e.g., TLY, AAK)
- `kind`: Fund type (YAT, EMK, BYF)
- `days`: Number of days or 'ybb' for year-to-date

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

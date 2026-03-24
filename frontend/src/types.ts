export type FundKind = 'YAT' | 'EMK' | 'BYF';

export interface FundSummary {
  code: string;
  title: string;
  kind: FundKind;
  latestDate: string;
  isTefasAvailable?: boolean; // Only applicable to YAT funds
}

export interface HistoricalPoint {
  date: string; // ISO date string
  value: number;
}

export interface AllocationSlice {
  label: string;
  value: number;
}

export interface FundOverview {
  code: string;
  title: string;
  kind: FundKind;
  priceHistory: HistoricalPoint[];
  marketCapHistory: HistoricalPoint[];
  investorHistory: HistoricalPoint[];
  allocation: AllocationSlice[];
  latestPrice: number;
  latestDate: string;
}

export interface FundRiskMetrics {
  sharpe: number | null;
  volatility: number | null;
  maxDrawdown: number | null;
  return1m: number | null;
  return3m: number | null;
  return1y: number | null;
}

export interface FundRiskResponse {
  code: string;
  range: { start: string; end: string };
  metrics: FundRiskMetrics;
}

export interface FundScreenResult {
  fon_kodu: string;
  unvan: string;
  portfoy_yonetim_sirketi: string | null;
  fon_tipi: string;
  fon_kategorisi: string | null;
  risk_seviyesi: number | null;
  getiri_1g: number | null;
  getiri_1h: number | null;
  getiri_1a: number | null;
  getiri_3a: number | null;
  getiri_6a: number | null;
  getiri_ytd: number | null;
  getiri_1y: number | null;
  yonetim_ucreti: number | null;
  stopaj: number | null;
  rsi_14: number | null;
  rsi_sinyal: string | null;
  sma_50: number | null;
  sma_200: number | null;
  sma_kesisim_20_50: boolean | null;
  ma200_ustu: boolean | null;
}

export interface PortfolioHoldingInput {
  code: string;
  shares: number;
  cost: number;
}

export interface PortfolioHolding extends PortfolioHoldingInput {
  latestPrice: number;
  latestDate: string | null;
  value: number;
  pnl: number;
  weight: number;
}

export interface PortfolioValuation {
  totalValue: number;
  totalCost: number;
  pnl: number;
  pnlPct: number | null;
  holdings: PortfolioHolding[];
}

export interface MacroSeries {
  symbol: string;
  range: { start: string; end: string };
  series: HistoricalPoint[];
  source?: string;
}

export interface TechnicalScanResult {
  code: string;
  title: string;
  kind: FundKind;
  rsi: number | null;
  shortSma: number | null;
  longSma: number | null;
  smaCross: boolean;
}

export interface MarketEvent {
  id: number;
  date: string;
  type: string;
  ticker: string | null;
  fundCode: string | null;
  title: string;
  description: string | null;
  note: string | null;       // alias for description used in EventsPage
  impact: string;            // 'high' | 'medium' | 'low' — from kap_events
  value: string | null;
  kapId: number | null;
}

// ── New interfaces added in overhaul ──────────────────────────────────────────

export interface FundProfile {
  fon_kodu: string;
  unvan: string;
  fon_tipi: string;
  portfoy_yonetim_sirketi: string | null;
  risk_seviyesi: number | null;
  stopaj: number | null;
  yonetim_ucreti: number | null;
  alis_valoru: number | null;
  satis_valoru: number | null;
  fon_kategorisi: string | null;
  tefasa_acik: boolean | null;
  metriks: {
    getiri_1y: number | null;
    getiri_1a: number | null;
    fon_buyuklugu: number | null;
    yatirimci_sayisi: number | null;
    sharpe: number | null;
    max_drawdown: number | null;
    volatilite: number | null;
  };
  varlik_dagilimi: Array<{ kod: string; ad: string; agirlik: number }>;
  topHoldings: Array<{ ticker: string; agirlik: number }>;
  rapor: { yil: number; ay: number } | null;
}

export interface OverlapResult {
  rapor: { yil: number | null; ay: number | null };
  matrix: Record<string, Record<string, { pct: number; sharedCount: number }>>;
  sharedHoldings: Array<{
    ticker: string;
    weights: Record<string, number>;
    fundCount: number;
  }>;
}

export interface HoldingsScreenerResult {
  ticker: string;
  rapor: { yil: number; ay: number } | null;
  fonlar: Array<{
    fon_kodu: string;
    unvan: string;
    portfoy_yonetim_sirketi: string | null;
    agirlik: number;
    getiri_1y: number | null;
    risk_seviyesi: number | null;
  }>;
}

export interface PortfolioExposure {
  totalValue: number;
  rapor: { yil: number | null; ay: number | null };
  exposure: Array<{
    ticker: string;
    effectiveWeight: number;
    effectiveTRY: number;
    byFund: Record<string, { fundWeight: number; contribution: number }>;
  }>;
}


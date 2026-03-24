import {
  FundKind,
  FundOverview,
  FundSummary,
  FundRiskResponse,
  FundScreenResult,
  MacroSeries,
  PortfolioHoldingInput,
  PortfolioValuation,
  TechnicalScanResult,
  MarketEvent,
  FundProfile,
  OverlapResult,
  HoldingsScreenerResult,
  PortfolioExposure,
} from './types';

const RAW_API_BASE = import.meta.env.VITE_API_BASE || '';
const REQUEST_TIMEOUT_MS = 60000;

const getApiBase = (): string => {
  const trimmed = RAW_API_BASE.trim().replace(/\/$/, '');
  if (trimmed) return trimmed;
  if (typeof window !== 'undefined') return window.location.origin;
  throw new Error('API base URL is not configured');
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Request failed');
  }
  return response.json() as Promise<T>;
};

const fetchWithTimeout = async <T>(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return await handleResponse<T>(response);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const fetchFunds = async (kind: FundKind = 'YAT'): Promise<FundSummary[]> => {
  const apiBase = getApiBase();
  const response = await fetchWithTimeout<{ funds: FundSummary[] }>(
    `${apiBase}/api/funds?kind=${kind}`
  );
  return response.funds;
};

export const fetchFundDetails = async (
  code: string,
  kind: FundKind = 'YAT',
  days?: number
): Promise<FundOverview> => {
  const apiBase = getApiBase();
  const url = new URL(`${apiBase}/api/fund-history`);
  url.searchParams.append('code', code);
  url.searchParams.append('kind', kind);
  if (days) url.searchParams.append('days', days.toString());

  const response = await fetchWithTimeout<{ fund: FundOverview }>(url.toString());
  return response.fund;
};

export const fetchFundRisk = async (code: string, days = 365): Promise<FundRiskResponse> => {
  const apiBase = getApiBase();
  const url = new URL(`${apiBase}/api/fund-risk`);
  url.searchParams.append('code', code);
  url.searchParams.append('days', days.toString());
  return fetchWithTimeout<FundRiskResponse>(url.toString());
};

export const fetchFundScreen = async (filters: {
  fonTipi?: string;
  fonKategorisi?: string;
  minRisk?: number;
  maxRisk?: number;
  minGetiri1g?: number;
  minGetiri1a?: number;
  minGetiriYtd?: number;
  minGetiri1y?: number;
  stopaj?: number;
  rsiSinyal?: string;
  limit?: number;
} = {}): Promise<FundScreenResult[]> => {
  const apiBase = getApiBase();
  const url = new URL(`${apiBase}/api/fund-screen`);
  if (filters.fonTipi) url.searchParams.append('fonTipi', filters.fonTipi);
  if (filters.fonKategorisi) url.searchParams.append('fonKategorisi', filters.fonKategorisi);
  if (filters.minRisk !== undefined) url.searchParams.append('minRisk', String(filters.minRisk));
  if (filters.maxRisk !== undefined) url.searchParams.append('maxRisk', String(filters.maxRisk));
  if (filters.minGetiri1g !== undefined) url.searchParams.append('minGetiri1g', String(filters.minGetiri1g));
  if (filters.minGetiri1a !== undefined) url.searchParams.append('minGetiri1a', String(filters.minGetiri1a));
  if (filters.minGetiriYtd !== undefined) url.searchParams.append('minGetiriYtd', String(filters.minGetiriYtd));
  if (filters.minGetiri1y !== undefined) url.searchParams.append('minGetiri1y', String(filters.minGetiri1y));
  if (filters.stopaj !== undefined) url.searchParams.append('stopaj', String(filters.stopaj));
  if (filters.rsiSinyal) url.searchParams.append('rsiSinyal', filters.rsiSinyal);
  if (filters.limit !== undefined) url.searchParams.append('limit', String(filters.limit));
  const payload = await fetchWithTimeout<{ results: FundScreenResult[] }>(url.toString());
  return payload.results;
};

export const fetchPortfolioValuation = async (holdings: PortfolioHoldingInput[]): Promise<PortfolioValuation> => {
  const apiBase = getApiBase();
  return fetchWithTimeout<PortfolioValuation>(`${apiBase}/api/portfolio?type=valuation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holdings }),
  });
};

export const fetchMacroSeries = async (symbol = 'USDTRY', days = 365): Promise<MacroSeries> => {
  const apiBase = getApiBase();
  const url = new URL(`${apiBase}/api/macro-series`);
  url.searchParams.append('symbol', symbol);
  url.searchParams.append('days', days.toString());
  return fetchWithTimeout<MacroSeries>(url.toString());
};

export const fetchTechnicalScan = async (kind: FundKind, rsiBelow = 30) => {
  const apiBase = getApiBase();
  const url = new URL(`${apiBase}/api/fund-technical-scan`);
  url.searchParams.append('kind', kind);
  url.searchParams.append('rsiBelow', rsiBelow.toString());
  const payload = await fetchWithTimeout<{ results: TechnicalScanResult[] }>(url.toString());
  return payload.results;
};

export const fetchMarketEvents = async (start?: string, end?: string, type?: string): Promise<MarketEvent[]> => {
  const apiBase = getApiBase();
  const url = new URL(`${apiBase}/api/market-events`);
  if (start) url.searchParams.append('start', start);
  if (end) url.searchParams.append('end', end);
  if (type) url.searchParams.append('type', type);
  const payload = await fetchWithTimeout<{ events: MarketEvent[] }>(url.toString());
  return payload.events;
};

// ── New endpoints added in overhaul ──────────────────────────────────────────

export const fetchFundProfile = async (code: string): Promise<FundProfile> => {
  const apiBase = getApiBase();
  return fetchWithTimeout<FundProfile>(`${apiBase}/api/fund-profile?code=${encodeURIComponent(code)}`);
};

export const fetchOverlap = async (fundCodes: string[]): Promise<OverlapResult> => {
  const apiBase = getApiBase();
  return fetchWithTimeout<OverlapResult>(
    `${apiBase}/api/overlap?funds=${fundCodes.map(encodeURIComponent).join(',')}`
  );
};

export const fetchHoldingsScreener = async (params: {
  ticker: string;
  minWeight?: number;
  fundType?: string;
  limit?: number;
}): Promise<HoldingsScreenerResult> => {
  const apiBase = getApiBase();
  const q = new URLSearchParams({
    ticker: params.ticker,
    minWeight: String(params.minWeight ?? 0),
    fundType: params.fundType ?? 'mutual',
    ...(params.limit !== undefined ? { limit: String(params.limit) } : {}),
  });
  return fetchWithTimeout<HoldingsScreenerResult>(`${apiBase}/api/holdings-screener?${q}`);
};

export const fetchPortfolioExposure = async (
  holdings: Array<{ fundCode: string; shares: number; currentValue: number }>
): Promise<PortfolioExposure> => {
  const apiBase = getApiBase();
  return fetchWithTimeout<PortfolioExposure>(`${apiBase}/api/portfolio?type=exposure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holdings }),
  });
};

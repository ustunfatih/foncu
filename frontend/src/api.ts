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
} from './types';

const RAW_API_BASE = import.meta.env.VITE_API_BASE || '';
const REQUEST_TIMEOUT_MS = 30000;

const getApiBase = (): string => {
  const trimmed = RAW_API_BASE.trim().replace(/\/$/, '');
  if (trimmed) return trimmed;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
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
  if (!apiBase) {
    throw new Error('API base URL is not configured');
  }
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
  if (!apiBase) {
    throw new Error('API base URL is not configured');
  }
  const url = new URL(`${apiBase}/api/fund-history`);
  url.searchParams.append('code', code);
  url.searchParams.append('kind', kind);
  if (days) url.searchParams.append('days', days.toString());

  const response = await fetchWithTimeout<{ fund: FundOverview }>(url.toString());
  return response.fund;
};

export const fetchFundRisk = async (code: string, days = 365): Promise<FundRiskResponse> => {
  const apiBase = getApiBase();
  if (!apiBase) {
    throw new Error('API base URL is not configured');
  }
  const url = new URL(`${apiBase}/api/fund-risk`);
  url.searchParams.append('code', code);
  url.searchParams.append('days', days.toString());
  return fetchWithTimeout<FundRiskResponse>(url.toString());
};

export const fetchFundScreen = async (kind: FundKind, minReturn1y?: number, minReturn1m?: number) => {
  const apiBase = getApiBase();
  if (!apiBase) {
    throw new Error('API base URL is not configured');
  }
  const url = new URL(`${apiBase}/api/fund-screen`);
  url.searchParams.append('kind', kind);
  if (minReturn1y !== undefined) url.searchParams.append('minReturn1y', String(minReturn1y));
  if (minReturn1m !== undefined) url.searchParams.append('minReturn1m', String(minReturn1m));
  const payload = await fetchWithTimeout<{ results: FundScreenResult[] }>(url.toString());
  return payload.results;
};

export const fetchPortfolioValuation = async (holdings: PortfolioHoldingInput[]): Promise<PortfolioValuation> => {
  const apiBase = getApiBase();
  if (!apiBase) {
    throw new Error('API base URL is not configured');
  }
  return fetchWithTimeout<PortfolioValuation>(`${apiBase}/api/portfolio-valuation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ holdings }),
  });
};

export const fetchMacroSeries = async (symbol = 'USDTRY', days = 365): Promise<MacroSeries> => {
  const apiBase = getApiBase();
  if (!apiBase) {
    throw new Error('API base URL is not configured');
  }
  const url = new URL(`${apiBase}/api/macro-series`);
  url.searchParams.append('symbol', symbol);
  url.searchParams.append('days', days.toString());
  return fetchWithTimeout<MacroSeries>(url.toString());
};

export const fetchTechnicalScan = async (kind: FundKind, rsiBelow = 30) => {
  const apiBase = getApiBase();
  if (!apiBase) {
    throw new Error('API base URL is not configured');
  }
  const url = new URL(`${apiBase}/api/fund-technical-scan`);
  url.searchParams.append('kind', kind);
  url.searchParams.append('rsiBelow', rsiBelow.toString());
  const payload = await fetchWithTimeout<{ results: TechnicalScanResult[] }>(url.toString());
  return payload.results;
};

export const fetchMarketEvents = async (start?: string, end?: string, type?: string): Promise<MarketEvent[]> => {
  const apiBase = getApiBase();
  if (!apiBase) {
    throw new Error('API base URL is not configured');
  }
  const url = new URL(`${apiBase}/api/market-events`);
  if (start) url.searchParams.append('start', start);
  if (end) url.searchParams.append('end', end);
  if (type) url.searchParams.append('type', type);
  const response = await fetchWithTimeout<Response>(url.toString());
  const payload = await handleResponse<{ events: MarketEvent[] }>(response);
  return payload.events;
};

import { useCallback, useEffect, useMemo, useState } from 'react';
import FundSelector from './components/FundSelector';
import FundCard from './components/FundCard';
import PerformanceChart from './components/PerformanceChart';
import EmptyState from './components/EmptyState';
import ErrorState from './components/ErrorState';
import ExportPage from './pages/ExportPage';
import FundScreenerPage from './pages/FundScreenerPage';
import PortfolioPage from './pages/PortfolioPage';
import BenchmarkPage from './pages/BenchmarkPage';
import MacroPage from './pages/MacroPage';
import TechnicalScannerPage from './pages/TechnicalScannerPage';
import EventsPage from './pages/EventsPage';
import OrtusmeTab from './pages/OrtusmeTab';
import { FundProfileDrawer } from './components/FundProfileDrawer';
import { ChartSkeleton, FundCardSkeleton } from './components/LoadingSkeleton';
import { fetchFundDetails, fetchFunds } from './api';
import { FundKind, FundOverview, FundSummary, HistoricalPoint } from './types';
import { useAuth } from './context/AuthContext';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import {
  calculateSharpeRatio,
  calculateVolatility,
  calculateMaxDrawdown,
  formatSharpeRatio,
  formatVolatility,
  formatMaxDrawdown
} from './utils/analytics';

const timeFilters = [
  { label: '1D', days: 1 },
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: 'YBB', days: 'ybb' },
  { label: '1Y', days: 365 },
  { label: '3Y', days: 365 * 3 },
  { label: '5Y', days: 365 * 5 },
];

const metricFilters = [
  { label: 'Price', key: 'priceHistory' },
  { label: 'Investors', key: 'investorHistory' },
  { label: 'Market Cap', key: 'marketCapHistory' },
];

const fundKinds: { label: string; value: FundKind }[] = [
  { label: 'Yatırım Fonları (YAT)', value: 'YAT' },
  { label: 'Emeklilik Fonları (EMK)', value: 'EMK' },
  { label: 'Borsa Yatırım Fonları (BYF)', value: 'BYF' },
];

const fundColors = ['var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)', 'var(--color-chart-4)', 'var(--color-chart-5)'];

const SELECTED_CODES_KEY = 'foncu_selectedCodes';
const THEME_KEY = 'foncu_theme';

const App = () => {
  const initialTab = (() => {
    const p = new URLSearchParams(window.location.search).get('tab');
    if (p === 'ortusme') return 'ortusme' as const;
    return 'home' as const;
  })();
  const initialFunds = (() => {
    const f = new URLSearchParams(window.location.search).get('funds');
    return f ? f.split(',').slice(0, 5) : [];
  })();

  const [activeTab, setActiveTab] = useState<'home' | 'screener' | 'portfolio' | 'benchmark' | 'macro' | 'technical' | 'events' | 'export' | 'ortusme'>(initialTab);
  const [profileDrawerCode, setProfileDrawerCode] = useState<string | null>(null);
  const [profileDrawerIndex, setProfileDrawerIndex] = useState(0);
  const [overlapFunds, setOverlapFunds] = useState<string[]>(initialFunds);
  const [fundKind, setFundKind] = useState<FundKind>('YAT');
  const [pendingFundKind, setPendingFundKind] = useState<FundKind>('YAT');
  const [isNormalized, setIsNormalized] = useState(false);
  const [showMA, setShowMA] = useState(false);
  const [funds, setFunds] = useState<FundSummary[]>([]);
  const [selectedFunds, setSelectedFunds] = useState<FundOverview[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<{ code: string; kind: FundKind }[]>(() => {
    try {
      const saved = localStorage.getItem(SELECTED_CODES_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeTimeFilter, setActiveTimeFilter] = useState(timeFilters[3]);
  const [activeMetric, setActiveMetric] = useState(metricFilters[0]);
  const [loadingFunds, setLoadingFunds] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return (saved as 'light' | 'dark') || 'light';
    } catch {
      return 'light';
    }
  });

  const { user, signInWithGithub, signOut } = useAuth();
  const isAuthEnabled = isSupabaseConfigured;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  const savePortfolio = async () => {
    if (!isAuthEnabled || !user || selectedCodes.length === 0) return;
    try {
      const { error } = await supabase.from('portfolios').upsert({
        user_id: user.id,
        name: 'My Portfolio',
        fund_list: selectedCodes,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,name' });
      if (error) throw error;
      alert('Portföy kaydedildi!');
    } catch (err) {
      console.error('Save failed:', err);
      alert('Portföy kaydedilemedi.');
    }
  };

  useEffect(() => {
    if (!isAuthEnabled || !user) return;
    const loadPortfolio = async () => {
      const { data } = await supabase
        .from('portfolios')
        .select('fund_list')
        .eq('user_id', user.id)
        .single();
      if (data?.fund_list && Array.isArray(data.fund_list)) {
        setSelectedCodes(data.fund_list);
      }
    };
    loadPortfolio();
  }, [isAuthEnabled, user]);

  useEffect(() => {
    try {
      localStorage.setItem(SELECTED_CODES_KEY, JSON.stringify(selectedCodes));
    } catch {}
  }, [selectedCodes]);

  useEffect(() => {
    const loadFunds = async () => {
      try {
        setLoadingFunds(true);
        setError(null);
        const data = await fetchFunds(fundKind);
        setFunds(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load funds');
      } finally {
        setLoadingFunds(false);
      }
    };
    loadFunds();
  }, [fundKind]);

  useEffect(() => {
    const loadNewDetails = async () => {
      const daysParam = activeTimeFilter.days === 'ybb' ? getDaysForYBB() : (activeTimeFilter.days as number);
      const toFetch = selectedCodes.filter(
        ({ code }) => {
          const existingFund = selectedFunds.find((f) => f.code === code);
          if (!existingFund) return true;
          const history = existingFund[activeMetric.key as keyof FundOverview] as HistoricalPoint[];
          return !history || history.length < daysParam;
        }
      );

      if (toFetch.length === 0) {
        setSelectedFunds((prev) => prev.filter((f) => selectedCodes.some(s => s.code === f.code)));
        return;
      }

      try {
        setLoadingDetails(true);
        const newFunds = await Promise.all(
          toFetch.map(({ code, kind }) => fetchFundDetails(code, kind, daysParam))
        );
        setSelectedFunds((prev) => {
          const codesToReplace = toFetch.map(f => f.code);
          const currentCodes = selectedCodes.map(s => s.code);
          const updatedFunds = prev.filter((f) => !codesToReplace.includes(f.code) && currentCodes.includes(f.code));
          return [...updatedFunds, ...newFunds];
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load fund details');
        setSelectedCodes(prev => prev.filter(c => !toFetch.some(f => f.code === c.code)));
      } finally {
        setLoadingDetails(false);
      }
    };

    loadNewDetails();
    setSelectedFunds((prev) => prev.filter((f) => selectedCodes.some(s => s.code === f.code)));
  }, [selectedCodes, activeTimeFilter.days, activeMetric.key, refreshKey]);

  const handleConfirmFundKind = useCallback(() => {
    setFundKind(pendingFundKind);
    setSelectedCodes([]);
    setSelectedFunds([]);
  }, [pendingFundKind]);

  const handleFundSelect = useCallback((fund: FundSummary) => {
    setSelectedCodes((prev) =>
      prev.some(s => s.code === fund.code)
        ? prev.filter((s) => s.code !== fund.code)
        : prev.length < 5
          ? [...prev, { code: fund.code, kind: fund.kind }]
          : prev
    );
  }, []);

  const handleRemoveFund = useCallback((code: string) => {
    setSelectedCodes(prev => prev.filter(s => s.code !== code));
  }, []);

  const handleRefresh = useCallback(() => {
    setSelectedFunds([]);
    setRefreshKey(k => k + 1);
  }, []);

  const getDaysForYBB = () => {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const diff = now.getTime() - startOfYear.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const chartData = useMemo(() => {
    if (selectedFunds.length === 0) return [];

    const days = activeTimeFilter.days === 'ybb' ? getDaysForYBB() : (activeTimeFilter.days as number);
    const dateMap: Record<string, Record<string, number>> = {};

    const calculateSMA = (data: HistoricalPoint[], period: number): Map<string, number> => {
      const result = new Map<string, number>();
      if (data.length < period) return result;
      let windowSum = 0;
      for (let i = 0; i < period; i++) {
        windowSum += data[i].value;
      }
      result.set(data[period - 1].date, windowSum / period);
      for (let i = period; i < data.length; i++) {
        windowSum += data[i].value - data[i - period].value;
        result.set(data[i].date, windowSum / period);
      }
      return result;
    };

    selectedFunds.forEach(fund => {
      const history = fund[activeMetric.key as keyof FundOverview] as HistoricalPoint[];
      if (!history || history.length === 0) return;

      const ma50Map = showMA ? calculateSMA(history, 50) : null;
      const ma200Map = showMA ? calculateSMA(history, 200) : null;

      const startIndex = Math.max(history.length - (days || 1), 0);
      const slice = history.slice(startIndex);
      const baseValue = slice[0]?.value;
      const baseMa50 = ma50Map?.get(slice[0]?.date) ?? null;
      const baseMa200 = ma200Map?.get(slice[0]?.date) ?? null;

      slice.forEach((point) => {
        const dateStr = point.date;
        if (!dateMap[dateStr]) dateMap[dateStr] = {};

        if (isNormalized && baseValue !== 0) {
          dateMap[dateStr][fund.code] = ((point.value / baseValue) - 1) * 100;
        } else {
          dateMap[dateStr][fund.code] = point.value;
        }

        if (showMA && ma50Map) {
          const ma50Value = ma50Map.get(dateStr);
          if (ma50Value !== undefined) {
            if (isNormalized && baseMa50 !== null && baseMa50 !== 0) {
              dateMap[dateStr][`${fund.code}_MA50`] = ((ma50Value / baseMa50) - 1) * 100;
            } else if (!isNormalized) {
              dateMap[dateStr][`${fund.code}_MA50`] = ma50Value;
            }
          }
        }
        if (showMA && ma200Map) {
          const ma200Value = ma200Map.get(dateStr);
          if (ma200Value !== undefined) {
            if (isNormalized && baseMa200 !== null && baseMa200 !== 0) {
              dateMap[dateStr][`${fund.code}_MA200`] = ((ma200Value / baseMa200) - 1) * 100;
            } else if (!isNormalized) {
              dateMap[dateStr][`${fund.code}_MA200`] = ma200Value;
            }
          }
        }
      });
    });

    return Object.entries(dateMap)
      .map(([date, values]) => ({ date, ...values }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedFunds, activeTimeFilter, activeMetric, isNormalized, showMA]);

  const tabs = [
    { id: 'home', label: 'Anasayfa', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { id: 'screener', label: 'Fon Tarayıcı', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg> },
    { id: 'portfolio', label: 'Portföy', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> },
    { id: 'benchmark', label: 'Benchmark', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg> },
    { id: 'macro', label: 'Makro', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> },
    { id: 'technical', label: 'Teknik Tarama', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
    { id: 'events', label: 'Takvim', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { id: 'export', label: 'Export', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> },
    { id: 'ortusme', label: 'Örtüşme ✦', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg> },
  ] as const;

  return (
    <div className="container">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      
      <header className="page-header">
        <div>
          <h1 className="title" style={{ marginBottom: '4px' }}>TEFAS Fund Dashboard</h1>
          <p className="subtitle">Interactive performance tracking for multiple investment funds</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            className="theme-toggle" 
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            <span className="moon-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            </span>
            <span className="sun-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            </span>
          </button>
          
          {user ? (
            <>
              <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>{user.email || user.user_metadata?.user_name}</span>
              <button 
                className="chip active" 
                onClick={savePortfolio} 
                disabled={selectedCodes.length === 0}
                aria-label="Save portfolio"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}>
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
                Kaydet
              </button>
              <button 
                className="chip" 
                onClick={signOut}
                aria-label="Sign out"
              >
                Çıkış
              </button>
            </>
          ) : (
            <button
              className="github-login-btn"
              onClick={signInWithGithub}
              disabled={!isAuthEnabled}
              title={!isAuthEnabled ? 'Supabase ortam değişkenleri eksik.' : 'GitHub ile giriş'}
              aria-label="Sign in with GitHub"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              GitHub ile Giriş
            </button>
          )}
          <div className="badge">Tefas Crawler Engine</div>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="Main navigation">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            data-tab={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
          >
            <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      <main id="main-content" role="main">
        {error && (
          <ErrorState 
            title="Error" 
            description={error} 
            onRetry={() => { setError(null); setRefreshKey(k => k + 1); }} 
          />
        )}

        {activeTab === 'export' && <ExportPage fundKind={fundKind} />}
        {activeTab === 'screener' && <FundScreenerPage />}
        {activeTab === 'portfolio' && <PortfolioPage />}
        {activeTab === 'benchmark' && <BenchmarkPage />}
        {activeTab === 'macro' && <MacroPage />}
        {activeTab === 'technical' && <TechnicalScannerPage />}
        {activeTab === 'events' && <EventsPage />}
        {activeTab === 'ortusme' && <OrtusmeTab initialFunds={overlapFunds} />}

        {activeTab === 'home' && (
          <>
            <div className="filter-group">
              <div className="filter-row" style={{ marginBottom: '16px' }}>
                <span className="filter-label">Fund Type:</span>
                <div className="chip-group">
                  {fundKinds.map((kind) => (
                    <button
                      key={kind.value}
                      className={`chip ${pendingFundKind === kind.value ? 'active' : ''}`}
                      onClick={() => setPendingFundKind(kind.value)}
                      aria-pressed={pendingFundKind === kind.value}
                    >
                      {kind.label}
                    </button>
                  ))}
                  <button
                    className={`chip ${pendingFundKind !== fundKind ? 'active' : ''}`}
                    onClick={handleConfirmFundKind}
                    disabled={pendingFundKind === fundKind || loadingFunds}
                    style={{ marginLeft: '8px', opacity: pendingFundKind === fundKind ? 0.45 : 1 }}
                  >
                    {loadingFunds ? 'Yükleniyor...' : 'Fonları Yükle'}
                  </button>
                </div>
              </div>

              <div className="filter-row">
                <FundSelector
                  key={fundKind}
                  funds={funds}
                  selectedCodes={selectedCodes.map(s => s.code)}
                  onSelect={handleFundSelect}
                  loading={loadingFunds}
                />
              </div>

              <div className="selected-funds-grid">
                {loadingDetails && selectedCodes.length > selectedFunds.length ? (
                  <>
                    {selectedFunds.map((fund, index) => (
                      <FundCard 
                        key={fund.code} 
                        fund={fund} 
                        onRemove={() => handleRemoveFund(fund.code)} 
                        color={fundColors[index % fundColors.length]} 
                      />
                    ))}
                    {Array.from({ length: selectedCodes.length - selectedFunds.length }).map((_, i) => (
                      <FundCardSkeleton key={`skeleton-${i}`} />
                    ))}
                  </>
                ) : (
                  selectedFunds.map((fund, index) => (
                    <div 
                      key={fund.code} 
                      style={{ cursor: 'pointer' }}
                      onClick={() => { setProfileDrawerCode(fund.code); setProfileDrawerIndex(index); }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && (setProfileDrawerCode(fund.code), setProfileDrawerIndex(index))}
                    >
                      <FundCard 
                        fund={fund} 
                        onRemove={() => handleRemoveFund(fund.code)} 
                        color={fundColors[index % fundColors.length]} 
                      />
                    </div>
                  ))
                )}
              </div>

              <div className="card">
                <div className="filter-row" style={{ marginBottom: '16px' }}>
                  <span className="filter-label">Time Period:</span>
                  <div className="chip-group">
                    {timeFilters.map((filter) => (
                      <button
                        key={filter.label}
                        className={`chip ${filter.label === activeTimeFilter.label ? 'active' : ''}`}
                        onClick={() => setActiveTimeFilter(filter)}
                        aria-pressed={filter.label === activeTimeFilter.label}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="filter-row" style={{ marginBottom: '16px' }}>
                  <span className="filter-label">Metric:</span>
                  <div className="chip-group">
                    {metricFilters.map((filter) => (
                      <button
                        key={filter.label}
                        className={`chip ${filter.label === activeMetric.label ? 'active' : ''}`}
                        onClick={() => setActiveMetric(filter)}
                        aria-pressed={filter.label === activeMetric.label}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="filter-row">
                  <span className="filter-label">Chart Mode:</span>
                  <div className="chip-group">
                    <button
                      className={`chip ${isNormalized ? 'active' : ''}`}
                      onClick={() => setIsNormalized(!isNormalized)}
                      aria-pressed={isNormalized}
                    >
                      Percentage Change (%)
                    </button>
                    <button
                      className={`chip ${showMA ? 'active' : ''}`}
                      onClick={() => setShowMA(!showMA)}
                      aria-pressed={showMA}
                    >
                      Moving Averages (MA50/MA200)
                    </button>
                    <button
                      className="chip"
                      onClick={handleRefresh}
                      disabled={loadingDetails || selectedCodes.length === 0}
                      style={{ marginLeft: 'auto' }}
                      aria-label="Refresh data"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }}>
                        <path d="M23 4v6h-6"/>
                        <path d="M1 20v-6h6"/>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                      </svg>
                      {loadingDetails ? 'Yükleniyor...' : 'Yenile'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {selectedFunds.length > 0 ? (
              <>
                {loadingDetails ? (
                  <ChartSkeleton />
                ) : (
                  <PerformanceChart
                    data={chartData}
                    metricLabel={activeMetric.label}
                    selectedCodes={selectedCodes.map(s => s.code)}
                    isNormalized={isNormalized}
                    showMA={showMA}
                  />
                )}

                <div className="card" style={{ marginTop: '16px' }}>
                  <h3 className="section-title">Risk & Performance Metrics</h3>
                  <div className="analytics-grid">
                    {selectedFunds.map((fund, index) => {
                      const sharpe = fund.priceHistory ? calculateSharpeRatio(fund.priceHistory) : null;
                      const volatility = fund.priceHistory ? calculateVolatility(fund.priceHistory) : null;
                      const maxDD = fund.priceHistory ? calculateMaxDrawdown(fund.priceHistory) : null;

                      return (
                        <div
                          key={fund.code}
                          className="analytics-card"
                          style={{ borderLeftColor: fundColors[index % fundColors.length] }}
                        >
                          <div className="analytics-fund-code">{fund.code}</div>
                          <div className="analytics-metrics">
                            <div className="analytics-metric">
                              <span className="analytics-label">Sharpe Ratio:</span>
                              <span className="analytics-value">{formatSharpeRatio(sharpe)}</span>
                            </div>
                            <div className="analytics-metric">
                              <span className="analytics-label">Volatility:</span>
                              <span className="analytics-value">{formatVolatility(volatility)}</span>
                            </div>
                            <div className="analytics-metric">
                              <span className="analytics-label">Max Drawdown:</span>
                              <span className="analytics-value negative">{formatMaxDrawdown(maxDD)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <EmptyState 
                icon="chart"
                title="No funds selected"
                description="Select up to 5 funds to start tracking their performance. Use the search above to find and add funds to your portfolio."
                action={{
                  label: 'Browse Funds',
                  onClick: () => setActiveTab('screener')
                }}
              />
            )}
          </>
        )}
      </main>

      <FundProfileDrawer
        fundCode={profileDrawerCode}
        fundIndex={profileDrawerIndex}
        onClose={() => setProfileDrawerCode(null)}
        onAddToOverlap={(code) => {
          setOverlapFunds(prev => prev.includes(code) ? prev : [...prev, code].slice(0, 5));
          setProfileDrawerCode(null);
          setActiveTab('ortusme');
        }}
      />
    </div>
  );
};

export default App;
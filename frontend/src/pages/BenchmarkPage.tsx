import { useEffect, useMemo, useState } from 'react';
import { fetchFundDetails, fetchFunds } from '../api';
import { FundKind, FundOverview, FundSummary, HistoricalPoint } from '../types';
import PerformanceChart from '../components/PerformanceChart';
import ErrorState from '../components/ErrorState';
import { ChartSkeleton } from '../components/LoadingSkeleton';

const BenchmarkPage = () => {
  const [funds, setFunds] = useState<FundSummary[]>([]);
  const [baseCode, setBaseCode] = useState('');
  const [benchmarkCode, setBenchmarkCode] = useState('');
  const [baseFund, setBaseFund] = useState<FundOverview | null>(null);
  const [benchmarkFund, setBenchmarkFund] = useState<FundOverview | null>(null);
  const [loadingFunds, setLoadingFunds] = useState(true);
  const [loadingChart, setLoadingChart] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFunds = async () => {
    try {
      setLoadingFunds(true);
      setError(null);
      const data = await fetchFunds('BYF');
      // Filter out funds with .F suffix as they may not have price data
      const validFunds = data.filter(f => !f.code.endsWith('.F'));
      setFunds(validFunds);
      if (validFunds.length >= 2) {
        setBaseCode(validFunds[0].code);
        setBenchmarkCode(validFunds[1].code);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load funds');
    } finally {
      setLoadingFunds(false);
    }
  };

  useEffect(() => {
    loadFunds();
  }, []);

  const loadComparison = async () => {
    if (!baseCode || !benchmarkCode || funds.length === 0) return;
    try {
      setLoadingChart(true);
      setError(null);
      
      let baseFundData: FundOverview | null = null;
      let benchmarkFundData: FundOverview | null = null;
      
      try {
        const baseData = await fetchFundDetails(baseCode, 'BYF', 365);
        baseFundData = baseData;
      } catch (e) {
        console.error('Failed to load base fund:', e);
      }
      
      try {
        const benchmarkData = await fetchFundDetails(benchmarkCode, 'BYF', 365);
        benchmarkFundData = benchmarkData;
      } catch (e) {
        console.error('Failed to load benchmark fund:', e);
      }
      
      if (!baseFundData && !benchmarkFundData) {
        setError('Failed to load fund data');
        return;
      }
      
      setBaseFund(baseFundData);
      setBenchmarkFund(benchmarkFundData);
      
      if (!baseFundData || !benchmarkFundData) {
        setError('Some funds have no price data. Please try different funds.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load benchmark');
    } finally {
      setLoadingChart(false);
    }
  };

  useEffect(() => {
    if (baseCode && benchmarkCode && funds.length > 0) {
      loadComparison();
    }
  }, [baseCode, benchmarkCode, funds]);

  if (loadingFunds) {
    return (
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="title">Benchmark Karşılaştırması</h1>
            <p className="subtitle">BIST ETF'leri üzerinden fon performansını karşılaştırın.</p>
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <div className="skeleton skeleton-card" style={{ height: '200px' }} />
          <p style={{ marginTop: '16px', color: 'var(--color-text-secondary)' }}>Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (error && funds.length === 0) {
    return (
      <div className="container">
        <div className="page-header">
          <div>
            <h1 className="title">Benchmark Karşılaştırması</h1>
            <p className="subtitle">BIST ETF'leri üzerinden fon performansını karşılaştırın.</p>
          </div>
        </div>
        <ErrorState 
          title="Yükleme Hatası" 
          description={error} 
          onRetry={loadFunds} 
        />
      </div>
    );
  }

  const chartData = useMemo(() => {
    if (!baseFund || !benchmarkFund) return [];
    const map: Record<string, Record<string, number>> = {};

    const normalize = (series: HistoricalPoint[]) => {
      const first = series[0]?.value || 1;
      return series.map((point) => ({
        date: point.date,
        value: ((point.value - first) / first) * 100,
      }));
    };

    const baseSeries = normalize(baseFund.priceHistory);
    const benchmarkSeries = normalize(benchmarkFund.priceHistory);

    baseSeries.forEach((point) => {
      map[point.date] = { ...(map[point.date] || {}), [baseFund.code]: point.value };
    });
    benchmarkSeries.forEach((point) => {
      map[point.date] = { ...(map[point.date] || {}), [benchmarkFund.code]: point.value };
    });

    return Object.keys(map)
      .sort()
      .map((date) => ({ date, ...map[date] }));
  }, [baseFund, benchmarkFund]);

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="title">Benchmark Karşılaştırması</h1>
          <p className="subtitle">BIST ETF'leri üzerinden fon performansını karşılaştırın.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid grid-2">
          <label>
            Ana Fon (BYF)
            <select className="input" value={baseCode} onChange={(e) => setBaseCode(e.target.value)}>
              {funds.map((fund) => (
                <option key={fund.code} value={fund.code}>{fund.code} - {fund.title}</option>
              ))}
            </select>
          </label>
          <label>
            Benchmark Fon (BYF)
            <select className="input" value={benchmarkCode} onChange={(e) => setBenchmarkCode(e.target.value)}>
              {funds.map((fund) => (
                <option key={fund.code} value={fund.code}>{fund.code} - {fund.title}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loadingChart ? (
        <ChartSkeleton />
      ) : baseFund || benchmarkFund ? (
        <PerformanceChart
          data={chartData}
          metricLabel="Benchmark"
          selectedCodes={[
            ...(baseFund ? [baseFund.code] : []),
            ...(benchmarkFund ? [benchmarkFund.code] : [])
          ]}
          isNormalized
        />
      ) : funds.length < 2 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Karşılaştırma yapmak için en az 2 BYF fonu gereklidir.
          </p>
        </div>
      ) : null}
    </div>
  );
};

export default BenchmarkPage;
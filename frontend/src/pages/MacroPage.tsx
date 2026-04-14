import { useEffect, useState } from 'react';
import { fetchMacroSeries } from '../api';
import { MacroSeries } from '../types';
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { formatTry6 } from '../utils/format';

interface MacroIndicator {
  id: string;
  label: string;
  color: string;
  unit?: string;
}

const MACRO_INDICATORS: MacroIndicator[] = [
  { id: 'USDTRY', label: 'USD/TRY', color: '#2563eb' },
  { id: 'EURTRY', label: 'EUR/TRY', color: '#16a34a' },
  { id: 'GBPTRY', label: 'GBP/TRY', color: '#d97706' },
  { id: 'GOLD', label: 'Altın ( gram)', color: '#fbbf24', unit: 'TL' },
  { id: 'BRENT', label: 'Brent Petrol', color: '#dc2626', unit: 'USD' },
  { id: 'BIST100', label: 'BIST 100', color: '#9333ea' },
  { id: 'CBOND', label: 'Tahvil (2Y)', color: '#0891b2', unit: '%' },
];

const TIME_RANGES = [
  { label: '1A', days: 365 },
  { label: '3A', days: 365 * 3 },
  { label: '6A', days: 180 },
  { label: '1Y', days: 365 },
  { label: '3Y', days: 365 * 3 },
  { label: '5Y', days: 365 * 5 },
];

const MacroPage = () => {
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>(['USDTRY']);
  const [timeRange, setTimeRange] = useState(365);
  const [seriesMap, setSeriesMap] = useState<Record<string, MacroSeries>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSeries = async () => {
    if (selectedIndicators.length === 0) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const results = await Promise.all(
        selectedIndicators.map(async (id) => {
          const data = await fetchMacroSeries(id, timeRange);
          return { id, data };
        })
      );
      
      const newSeriesMap: Record<string, MacroSeries> = {};
      results.forEach(({ id, data }) => {
        newSeriesMap[id] = data;
      });
      setSeriesMap(newSeriesMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veri yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSeries();
  }, [selectedIndicators, timeRange]);

  const toggleIndicator = (id: string) => {
    setSelectedIndicators(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : prev.length < 4 
          ? [...prev, id]
          : prev
    );
  };

  const chartData = () => {
    if (Object.keys(seriesMap).length === 0) return [];
    
    const allDates = new Set<string>();
    Object.values(seriesMap).forEach(s => {
      s.series.forEach(p => allDates.add(p.date));
    });
    
    const sortedDates = Array.from(allDates).sort();
    const startIndex = Math.max(0, sortedDates.length - timeRange);
    const displayDates = sortedDates.slice(startIndex);
    
    return displayDates.map(date => {
      const point: Record<string, any> = { date };
      Object.entries(seriesMap).forEach(([id, series]) => {
        const p = series.series.find(s => s.date === date);
        if (p) {
          point[id] = p.value;
        }
      });
      return point;
    });
  };

  const formatYAxis = (value: number, id: string) => {
    const indicator = MACRO_INDICATORS.find(i => i.id === id);
    if (indicator?.unit === 'TL') return `${value.toFixed(0)} TL`;
    if (indicator?.unit === 'USD') return `$${value.toFixed(2)}`;
    if (indicator?.unit === '%') return `${value.toFixed(2)}%`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(2);
  };

  const latestValues = () => {
    return selectedIndicators.map(id => {
      const series = seriesMap[id];
      if (!series || series.series.length === 0) return null;
      const latest = series.series[series.series.length - 1];
      const indicator = MACRO_INDICATORS.find(i => i.id === id);
      return { id, ...latest, indicator };
    }).filter(Boolean);
  };

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="title">Makro Göstergeler</h1>
          <p className="subtitle">Döviz, emtia, endeks ve faiz oranlarını takip edin.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Indicator Selection */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Göstergeler (maks. 4)</div>
        <div className="chip-group">
          {MACRO_INDICATORS.map(indicator => (
            <button
              key={indicator.id}
              className={`chip ${selectedIndicators.includes(indicator.id) ? 'active' : ''}`}
              onClick={() => toggleIndicator(indicator.id)}
              style={selectedIndicators.includes(indicator.id) ? { borderColor: indicator.color } : undefined}
            >
              <span style={{ 
                display: 'inline-block', 
                width: 10, 
                height: 10, 
                borderRadius: '50%', 
                background: indicator.color,
                marginRight: 6 
              }} />
              {indicator.label}
            </button>
          ))}
        </div>
      </div>

      {/* Time Range Selection */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Zaman Aralığı</div>
        <div className="chip-group">
          {TIME_RANGES.map(range => (
            <button
              key={range.label}
              className={`chip ${timeRange === range.days ? 'active' : ''}`}
              onClick={() => setTimeRange(range.days)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Latest Values */}
      {latestValues().length > 0 && !loading && (
        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          {latestValues().map((item: any) => (
            <div key={item.id} className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                {item.indicator?.label}
              </div>
              <div style={{ 
                fontSize: 20, 
                fontWeight: 700, 
                fontFamily: 'var(--font-mono)',
                color: item.indicator?.color 
              }}>
                {item.indicator?.unit === 'TL' && '₺'}
                {item.indicator?.unit === 'USD' && '$'}
                {item.indicator?.unit === '%' && ''}
                {item.value?.toFixed(2)}
                {item.indicator?.unit === '%' && '%'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                {item.date}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <div className="skeleton skeleton-chart" />
          <p style={{ marginTop: 16, color: 'var(--color-text-secondary)' }}>Yükleniyor...</p>
        </div>
      ) : selectedIndicators.length === 0 ? (
        <div className="empty-state">
          <p>Göstergeleri seçmek için yukarıdaki butonları kullanın.</p>
        </div>
      ) : (
        <div className="card">
          <div className="section-title">Fiyat Grafiği</div>
          <div className="chart-wrapper" style={{ height: 400 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData()} margin={{ top: 12, right: 12, left: 12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  minTickGap={40} 
                  tickMargin={12}
                  tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                />
                <YAxis 
                  tick={{ fill: 'var(--color-text-tertiary)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    background: 'var(--color-bg-card)', 
                    border: '1px solid var(--color-border)', 
                    borderRadius: 12,
                    boxShadow: 'var(--shadow-lg)'
                  }}
                  labelStyle={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-secondary)' }}
                />
                <Legend 
                  wrapperStyle={{ 
                    paddingTop: 16, 
                    fontFamily: 'var(--font-body)', 
                    fontSize: 13 
                  }} 
                />
                {selectedIndicators.map(id => {
                  const indicator = MACRO_INDICATORS.find(i => i.id === id);
                  return (
                    <Line
                      key={id}
                      type="monotone"
                      dataKey={id}
                      name={indicator?.label || id}
                      stroke={indicator?.color || '#2563eb'}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                      animationDuration={1000}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Data Source Info */}
      {selectedIndicators.length > 0 && !loading && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          <strong>Veri Kaynakları:</strong> TCMB (döviz), BIST (endeks), Bloomberg/Forex (emtia)
        </div>
      )}
    </div>
  );
};

export default MacroPage;
import { useEffect, useState } from 'react';
import { fetchPortfolioValuation, fetchPortfolioExposure } from '../api';
import { formatTry, formatTry6 } from '../utils/format';
import { PortfolioHoldingInput, PortfolioValuation, PortfolioExposure } from '../types';

const STORAGE_KEY = 'portfolioHoldings';

const fmtPct = (n: number) => `${n >= 0 ? '' : ''}${n.toFixed(2)}%`;

const PortfolioPage = () => {
  const [holdings, setHoldings] = useState<PortfolioHoldingInput[]>([]);
  const [code, setCode] = useState('');
  const [shares, setShares] = useState(100);
  const [cost, setCost] = useState(1);
  const [valuation, setValuation] = useState<PortfolioValuation | null>(null);
  const [exposure, setExposure] = useState<PortfolioExposure | null>(null);
  const [loading, setLoading] = useState(false);
  const [exposureLoading, setExposureLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExposure, setShowExposure] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setHoldings(JSON.parse(stored)); } catch { setHoldings([]); }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
  }, [holdings]);

  const addHolding = () => {
    if (!code.trim() || shares <= 0) return;
    setHoldings(prev => [...prev, { code: code.trim().toUpperCase(), shares, cost }]);
    setCode('');
  };

  const removeHolding = (index: number) => setHoldings(prev => prev.filter((_, i) => i !== index));

  const calculate = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPortfolioValuation(holdings);
      setValuation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Portföy hesaplama başarısız');
    } finally {
      setLoading(false);
    }
  };

  const loadExposure = async () => {
    if (!valuation) return;
    setExposureLoading(true);
    setError(null);
    try {
      const exposureHoldings = valuation.holdings.map(h => ({
        fundCode: h.code,
        shares: h.value / (valuation.holdings.find(x => x.code === h.code)?.latestPrice || 1),
        currentValue: h.value,
      }));
      const data = await fetchPortfolioExposure(exposureHoldings);
      setExposure(data);
      setShowExposure(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Maruziyet hesaplama başarısız');
    } finally {
      setExposureLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="title">Portföy Yönetimi</h1>
          <p className="subtitle">Fonlarınızı ekleyin, toplam değer ve efektif hisse maruziyetini görün.</p>
        </div>
      </div>

      {/* Add holding */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid grid-3">
          <label>Fon Kodu<input className="input" value={code} onChange={e => setCode(e.target.value)} placeholder="AKB" /></label>
          <label>Adet<input className="input" type="number" value={shares} onChange={e => setShares(Number(e.target.value))} /></label>
          <label>Maliyet (TL)<input className="input" type="number" value={cost} onChange={e => setCost(Number(e.target.value))} /></label>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <button className="github-login-btn" onClick={addHolding}>Ekle</button>
          <button className="github-login-btn" onClick={calculate} disabled={loading || holdings.length === 0}>
            {loading ? 'Hesaplanıyor...' : 'Portföyü Hesapla'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Holdings list */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">Eklenen Fonlar</div>
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Kod</th><th>Adet</th><th>Maliyet</th><th></th></tr></thead>
            <tbody>
              {holdings.map((holding, index) => (
                <tr key={`${holding.code}-${index}`}>
                  <td>{holding.code}</td>
                  <td>{holding.shares}</td>
                  <td>{holding.cost}</td>
                  <td><button className="chip" onClick={() => removeHolding(index)}>Sil</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Valuation results */}
      {valuation && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="section-title" style={{ margin: 0 }}>Portföy Özeti</div>
            <button
              className="github-login-btn"
              style={{ background: '#5b21b6', color: '#fff', fontSize: 12 }}
              onClick={loadExposure}
              disabled={exposureLoading}
            >
              {exposureLoading ? 'Hesaplanıyor...' : '🔍 Efektif Maruziyet'}
            </button>
          </div>
          <div className="grid grid-3" style={{ marginBottom: 16 }}>
            <div>
              <div className="metric-value">{formatTry(valuation.totalValue)}</div>
              <div className="metric-label">Toplam Değer</div>
            </div>
            <div>
              <div className="metric-value" style={{ color: valuation.pnl >= 0 ? '#2e7d32' : '#c62828' }}>
                {formatTry(valuation.pnl)}
              </div>
              <div className="metric-label">Kar/Zarar</div>
            </div>
            <div>
              <div className="metric-value" style={{ color: (valuation.pnlPct ?? 0) >= 0 ? '#2e7d32' : '#c62828' }}>
                {valuation.pnlPct ? `${(valuation.pnlPct * 100).toFixed(1)}%` : 'N/A'}
              </div>
              <div className="metric-label">Getiri</div>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Kod</th><th>Son Fiyat</th><th>Değer</th><th>Ağırlık</th><th>PnL</th></tr></thead>
              <tbody>
                {valuation.holdings.map(h => (
                  <tr key={h.code}>
                    <td style={{ fontWeight: 700 }}>{h.code}</td>
                    <td>{formatTry6(h.latestPrice)}</td>
                    <td>{formatTry(h.value)}</td>
                    <td>{(h.weight * 100).toFixed(1)}%</td>
                    <td style={{ color: h.pnl >= 0 ? '#2e7d32' : '#c62828', fontWeight: 600 }}>{formatTry(h.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Efektif Hisse Maruziyeti */}
      {showExposure && exposure && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="section-title" style={{ margin: 0 }}>
              Efektif Hisse Maruziyeti
              {exposure.rapor.yil && (
                <span style={{ fontSize: 10, color: '#aaa', marginLeft: 8, fontWeight: 400 }}>
                  Rapor: {exposure.rapor.ay}/{exposure.rapor.yil}
                </span>
              )}
            </div>
            <button onClick={() => setShowExposure(false)} style={{ fontSize: 11, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer' }}>Gizle</button>
          </div>
          <p style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
            Portföyünüzdeki fonların altındaki hisselere toplam maruziyetiniz, her fonun portföy ağırlığıyla ağırlıklandırılmıştır.
          </p>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Hisse</th>
                  <th>Efektif Ağırlık</th>
                  <th>Efektif Değer (TL)</th>
                  <th>Fon Katkıları</th>
                </tr>
              </thead>
              <tbody>
                {exposure.exposure.map((item, i) => (
                  <tr key={item.ticker} style={{ background: i % 2 === 1 ? '#fafaf8' : undefined }}>
                    <td style={{ fontWeight: 700 }}>{item.ticker}</td>
                    <td style={{ fontWeight: 600, color: '#2e7d32' }}>{fmtPct(item.effectiveWeight)}</td>
                    <td>{formatTry(item.effectiveTRY)}</td>
                    <td style={{ fontSize: 10, color: '#666' }}>
                      {Object.entries(item.byFund).map(([fund, d]) => (
                        <span key={fund} style={{ marginRight: 8, whiteSpace: 'nowrap' }}>
                          <strong>{fund}</strong>: {d.fundWeight?.toFixed(1)}% → {d.contribution.toFixed(2)}%
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortfolioPage;

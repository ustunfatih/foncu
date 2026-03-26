import { useState, useEffect, useRef } from 'react';
import { fetchOverlap } from '../api';
import { OverlapResult } from '../types';

const FUND_COLORS = [
  { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
  { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
];

const overlapColor = (pct: number) => {
  if (pct >= 50) return '#e8f5e9';
  if (pct >= 30) return '#fff8e1';
  return '#fff0f0';
};
const overlapTextColor = (pct: number) => {
  if (pct >= 50) return '#2e7d32';
  if (pct >= 30) return '#e65100';
  return '#c62828';
};

interface Props {
  initialFunds?: string[];
}

const OrtusmeTab = ({ initialFunds = [] }: Props) => {
  const [fundInput, setFundInput] = useState('');
  const [selectedFunds, setSelectedFunds] = useState<string[]>(initialFunds);
  const [result, setResult] = useState<OverlapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [filterMin, setFilterMin] = useState(2);
  const hasAutoAnalyzed = useRef(false);

  // Sync initialFunds prop into local state (P2 fix)
  useEffect(() => {
    const incoming = initialFunds.join(',');
    if (incoming && incoming !== selectedFunds.join(',')) {
      setSelectedFunds(initialFunds);
      setResult(null);
      setFilterMin(2);
      hasAutoAnalyzed.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFunds.join(',')]);

  const addFund = () => {
    const code = fundInput.trim().toUpperCase();
    if (!code || selectedFunds.includes(code) || selectedFunds.length >= 5) return;
    setSelectedFunds(prev => [...prev, code]);
    setFundInput('');
  };

  const removeFund = (code: string) => setSelectedFunds(prev => prev.filter(c => c !== code));

  const analyze = async () => {
    if (selectedFunds.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOverlap(selectedFunds);
      setResult(data);
      setFilterMin(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analiz başarısız');
    } finally {
      setLoading(false);
    }
  };

  // Auto-analyze when ≥2 funds are pre-populated (P3 fix)
  useEffect(() => {
    if (selectedFunds.length >= 2 && !result && !loading && !hasAutoAnalyzed.current) {
      hasAutoAnalyzed.current = true;
      analyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFunds.length, result]);

  // Non-destructive filtering (P6 fix)
  const filteredHoldings = result
    ? result.sharedHoldings.filter(h => h.fundCount >= filterMin)
    : [];
  const visibleHoldings = showAll ? filteredHoldings : filteredHoldings.slice(0, 10);

  const hasMatrixData = result && Object.keys(result.matrix).length > 0;

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="title">Örtüşme Analizi</h1>
          <p className="subtitle">Seçili fonlar arasındaki hisse örtüşmesini analiz edin. En fazla 5 fon eklenebilir.</p>
        </div>
      </div>

      {/* Fund selector */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <input
            className="input"
            style={{ width: 120, textTransform: 'uppercase' }}
            placeholder="Fon kodu (AKB)"
            value={fundInput}
            onChange={e => setFundInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && addFund()}
            disabled={selectedFunds.length >= 5}
          />
          <button className="github-login-btn" onClick={addFund} disabled={selectedFunds.length >= 5 || !fundInput.trim()}>
            + Ekle
          </button>
          <button
            className="github-login-btn"
            onClick={analyze}
            disabled={selectedFunds.length < 2 || loading}
            style={{ background: '#5b21b6', color: '#fff' }}
          >
            {loading ? 'Hesaplanıyor...' : 'Analiz Et'}
          </button>
        </div>

        {/* Fund tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {selectedFunds.map((code, i) => {
            const c = FUND_COLORS[i % FUND_COLORS.length];
            return (
              <span key={code} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 999, fontWeight: 700, fontSize: 12,
                background: c.bg, color: c.text, border: `1px solid ${c.border}`
              }}>
                {code}
                <button onClick={() => removeFund(code)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.text, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            );
          })}
          {selectedFunds.length === 0 && (
            <span style={{ fontSize: 12, color: '#bbb' }}>Henüz fon eklenmedi. En az 2 fon ekleyin.</span>
          )}
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Warnings from backend (P5) */}
      {result?.warnings && result.warnings.length > 0 && (
        <div className="card" style={{ background: '#fff8e1', border: '1px solid #ffe082', marginBottom: 16, padding: '8px 16px', fontSize: 13, color: '#92400e' }}>
          {result.warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {/* Empty state (P4) */}
      {result && !hasMatrixData && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: '#888' }}>
          <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Veri bulunamadı</p>
          <p style={{ fontSize: 13, margin: 0 }}>
            Seçili fonlar için holding verisi henüz mevcut değil. Veriler her gün otomatik güncellenir.
          </p>
        </div>
      )}

      {result && hasMatrixData && (
        <>
          {/* Report date */}
          {result.rapor.yil && (
            <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8 }}>
              Rapor: {result.rapor.ay}/{result.rapor.yil} · Ağırlıklı Jaccard benzerliği kullanılmaktadır
            </div>
          )}

          {/* Overlap Matrix */}
          <div className="card" style={{ marginBottom: 16, overflowX: 'auto' }}>
            <div className="section-title">Örtüşme Matrisi</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#aaa', fontSize: 10, textTransform: 'uppercase' }}></th>
                  {selectedFunds.map((code, i) => (
                    <th key={code} style={{ padding: '8px 12px', fontWeight: 700, color: FUND_COLORS[i % FUND_COLORS.length].text }}>
                      {code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedFunds.map((rowCode, ri) => (
                  <tr key={rowCode}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: FUND_COLORS[ri % FUND_COLORS.length].text }}>
                      {rowCode}
                    </td>
                    {selectedFunds.map((colCode) => {
                      if (rowCode === colCode) return (
                        <td key={colCode} style={{ padding: '8px 12px', textAlign: 'center', color: '#ccc' }}>—</td>
                      );
                      const cell = result.matrix[rowCode]?.[colCode];
                      const pct = cell?.pct ?? 0;
                      return (
                        <td key={colCode} style={{ padding: '8px 12px', textAlign: 'center', background: overlapColor(pct), borderRadius: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: overlapTextColor(pct) }}>{pct.toFixed(1)}%</span>
                          <div style={{ fontSize: 10, color: '#888' }}>{cell?.sharedCount ?? 0} hisse</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 10, color: '#888' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#e8f5e9', border: '1px solid #a5d6a7', marginRight: 4 }} />≥50%: Yüksek (Fazla örtüşme)</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#fff8e1', border: '1px solid #ffe082', marginRight: 4 }} />30–50%: Orta</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#fff0f0', border: '1px solid #ffcdd2', marginRight: 4 }} />{'<'}30%: Düşük (İyi çeşitlendirme)</span>
            </div>
          </div>

          {/* Shared Holdings Table */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div className="section-title" style={{ margin: 0 }}>Ortak Hisseler ({filteredHoldings.length})</div>
              <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                {[2, 3, 4].map(n => (
                  selectedFunds.length >= n && (
                    <button key={n} className="chip"
                      style={{
                        fontSize: 10,
                        background: filterMin === n ? '#ede9fe' : undefined,
                        fontWeight: filterMin === n ? 700 : undefined,
                      }}
                      onClick={() => setFilterMin(n)}>
                      {n}+ Fon
                    </button>
                  )
                ))}
              </div>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Hisse</th>
                    {selectedFunds.map((code, i) => (
                      <th key={code} style={{ color: FUND_COLORS[i % FUND_COLORS.length].text }}>{code}</th>
                    ))}
                    <th>Fon Sayısı</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleHoldings.map(({ ticker, weights, fundCount }, idx) => (
                    <tr key={ticker} style={{ background: idx % 2 === 1 ? '#fafaf8' : undefined }}>
                      <td style={{ fontWeight: 700 }}>{ticker}</td>
                      {selectedFunds.map(code => (
                        <td key={code} style={{ fontWeight: 600, color: weights[code] != null ? '#2e7d32' : '#ccc' }}>
                          {weights[code] != null ? `${weights[code].toFixed(1)}%` : '—'}
                        </td>
                      ))}
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                          background: fundCount >= 4 ? '#ede9fe' : fundCount >= 3 ? '#dbeafe' : '#f0f0f0',
                          color: fundCount >= 4 ? '#5b21b6' : fundCount >= 3 ? '#1e40af' : '#666'
                        }}>
                          {fundCount} fon
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredHoldings.length > 10 && (
                <button onClick={() => setShowAll(p => !p)} style={{
                  display: 'block', margin: '10px auto 0', fontSize: 12, color: '#5b21b6',
                  background: 'none', border: '1px solid #c4b5fd', borderRadius: 6, padding: '4px 16px', cursor: 'pointer'
                }}>
                  {showAll ? 'Daha az göster' : `${filteredHoldings.length - 10} tane daha göster`}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default OrtusmeTab;

import { useState } from 'react';
import { fetchFundScreen, fetchHoldingsScreener } from '../api';
import { FundKind, FundScreenResult, HoldingsScreenerResult } from '../types';

type ScreenerMode = 'getiri' | 'hisse';

const FON_TIPI_LABELS: Record<string, string> = {
  mutual: 'Yatırım (YAT)',
  pension: 'Emeklilik (EMK)',
  exchange: 'BYF',
};

const RSI_SINYAL_LABELS: Record<string, string> = {
  guclu_al: 'Güçlü Al',
  al: 'Al',
  dikkat: 'Dikkat',
  normal: 'Normal',
};

const RSI_SINYAL_COLORS: Record<string, { bg: string; color: string }> = {
  guclu_al: { bg: '#bbf7d0', color: '#14532d' },
  al: { bg: '#dcfce7', color: '#166534' },
  dikkat: { bg: '#fef9c3', color: '#854d0e' },
  normal: { bg: '#f3f4f6', color: '#374151' },
};

const fmtPct = (n: number | null) =>
  n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

const fmtNum = (n: number | null) =>
  n == null ? '—' : n.toFixed(2);

const pctColor = (n: number | null) =>
  n == null ? undefined : n >= 0 ? '#2e7d32' : '#c62828';

const BoolIcon = ({ val }: { val: boolean | null }) => {
  if (val == null) return <span style={{ color: '#ccc' }}>—</span>;
  return val
    ? <span style={{ color: '#2e7d32', fontWeight: 700 }}>✓</span>
    : <span style={{ color: '#c62828' }}>✗</span>;
};

const FundScreenerPage = () => {
  const [mode, setMode] = useState<ScreenerMode>('getiri');

  // Filters
  const [fonTipi, setFonTipi] = useState('');
  const [fonKategorisi, setFonKategorisi] = useState('');
  const [minRisk, setMinRisk] = useState('');
  const [maxRisk, setMaxRisk] = useState('');
  const [minGetiri1g, setMinGetiri1g] = useState('');
  const [minGetiri1a, setMinGetiri1a] = useState('');
  const [minGetiriYtd, setMinGetiriYtd] = useState('');
  const [minGetiri1y, setMinGetiri1y] = useState('');
  const [stopaj, setStopaj] = useState('');
  const [rsiSinyal, setRsiSinyal] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FundScreenResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Hisse Filtresi state
  const [tickerInput, setTickerInput] = useState('');
  const [minWeight, setMinWeight] = useState(3);
  const [holdingsFonTipi, setHoldingsFonTipi] = useState<FundKind>('YAT');
  const [holdingsResult, setHoldingsResult] = useState<HoldingsScreenerResult | null>(null);
  const [holdingsLoading, setHoldingsLoading] = useState(false);

  const runScreen = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchFundScreen({
        fonTipi: fonTipi || undefined,
        fonKategorisi: fonKategorisi || undefined,
        minRisk: minRisk !== '' ? Number(minRisk) : undefined,
        maxRisk: maxRisk !== '' ? Number(maxRisk) : undefined,
        minGetiri1g: minGetiri1g !== '' ? Number(minGetiri1g) : undefined,
        minGetiri1a: minGetiri1a !== '' ? Number(minGetiri1a) : undefined,
        minGetiriYtd: minGetiriYtd !== '' ? Number(minGetiriYtd) : undefined,
        minGetiri1y: minGetiri1y !== '' ? Number(minGetiri1y) : undefined,
        stopaj: stopaj !== '' ? Number(stopaj) : undefined,
        rsiSinyal: rsiSinyal || undefined,
      });
      setResults(data);
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tarama başarısız');
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    setFonTipi('');
    setFonKategorisi('');
    setMinRisk('');
    setMaxRisk('');
    setMinGetiri1g('');
    setMinGetiri1a('');
    setMinGetiriYtd('');
    setMinGetiri1y('');
    setStopaj('');
    setRsiSinyal('');
    setResults([]);
    setHasSearched(false);
    setError(null);
  };

  const searchHoldings = async () => {
    if (!tickerInput.trim()) return;
    setHoldingsLoading(true);
    setError(null);
    try {
      const data = await fetchHoldingsScreener({
        ticker: tickerInput,
        minWeight,
        fundType: holdingsFonTipi,
      });
      setHoldingsResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Arama başarısız');
    } finally {
      setHoldingsLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    fontSize: 12,
    background: '#fff',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 11,
    color: '#555',
    fontWeight: 600,
  };

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="title">Fon Tarayıcı</h1>
          <p className="subtitle">Getiri filtresi veya hisse bazlı tarama ile fon arayın.</p>
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', background: '#f0f0ee', borderRadius: 10, padding: 4, gap: 4, width: 'fit-content', marginBottom: 16 }}>
        {(['getiri', 'hisse'] as ScreenerMode[]).map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: '6px 18px', borderRadius: 7, fontSize: 12, fontWeight: mode === m ? 700 : 500,
            border: 'none', cursor: 'pointer',
            background: mode === m ? '#fff' : 'transparent',
            color: mode === m ? '#111' : '#888',
            boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
          }}>
            {m === 'getiri' ? 'Getiri Filtresi' : 'Hisse Filtresi ✦'}
          </button>
        ))}
      </div>

      {/* Getiri Filtresi */}
      {mode === 'getiri' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            {/* Row 1 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
              <label style={labelStyle}>
                Fon Türü
                <select style={inputStyle} value={fonTipi} onChange={e => setFonTipi(e.target.value)}>
                  <option value="">Tümü</option>
                  <option value="mutual">Yatırım (YAT)</option>
                  <option value="pension">Emeklilik (EMK)</option>
                  <option value="exchange">BYF</option>
                </select>
              </label>

              <label style={labelStyle}>
                Fon Kategorisi
                <input style={inputStyle} type="text" placeholder="Örn: Hisse Senedi"
                  value={fonKategorisi} onChange={e => setFonKategorisi(e.target.value)} />
              </label>

              <label style={labelStyle}>
                Min Risk (1–7)
                <input style={inputStyle} type="number" min={1} max={7} placeholder="1"
                  value={minRisk} onChange={e => setMinRisk(e.target.value)} />
              </label>

              <label style={labelStyle}>
                Max Risk (1–7)
                <input style={inputStyle} type="number" min={1} max={7} placeholder="7"
                  value={maxRisk} onChange={e => setMaxRisk(e.target.value)} />
              </label>

              <label style={labelStyle}>
                Min 1G Getiri (%)
                <input style={inputStyle} type="number" placeholder="0"
                  value={minGetiri1g} onChange={e => setMinGetiri1g(e.target.value)} />
              </label>

              <label style={labelStyle}>
                Min 1A Getiri (%)
                <input style={inputStyle} type="number" placeholder="0"
                  value={minGetiri1a} onChange={e => setMinGetiri1a(e.target.value)} />
              </label>

              <label style={labelStyle}>
                Min YTD Getiri (%)
                <input style={inputStyle} type="number" placeholder="0"
                  value={minGetiriYtd} onChange={e => setMinGetiriYtd(e.target.value)} />
              </label>

              <label style={labelStyle}>
                Min 1Y Getiri (%)
                <input style={inputStyle} type="number" placeholder="0"
                  value={minGetiri1y} onChange={e => setMinGetiri1y(e.target.value)} />
              </label>

              <label style={labelStyle}>
                Stopaj
                <select style={inputStyle} value={stopaj} onChange={e => setStopaj(e.target.value)}>
                  <option value="">Tümü</option>
                  <option value="0">%0</option>
                  <option value="10">%10</option>
                  <option value="15">%15</option>
                </select>
              </label>

              <label style={labelStyle}>
                RSI Sinyali
                <select style={inputStyle} value={rsiSinyal} onChange={e => setRsiSinyal(e.target.value)}>
                  <option value="">Tümü</option>
                  <option value="guclu_al">Güçlü Al</option>
                  <option value="al">Al</option>
                  <option value="dikkat">Dikkat</option>
                  <option value="normal">Normal</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="github-login-btn" onClick={runScreen} disabled={loading}>
                {loading ? 'Taranıyor...' : 'Taramayı Çalıştır'}
              </button>
              <button onClick={resetFilters} disabled={loading} style={{
                padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                border: '1px solid #ddd', cursor: 'pointer', background: '#f9f9f7', color: '#555',
              }}>
                Sıfırla
              </button>
            </div>
          </div>

          {error && <div className="error-banner">{error}</div>}

          {hasSearched && (
            <div className="card">
              <div className="section-title" style={{ marginBottom: 10 }}>
                Sonuçlar ({results.length})
              </div>
              <div className="table-wrapper">
                <table className="table" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>Kod</th>
                      <th style={{ minWidth: 160 }}>Fon</th>
                      <th>PYŞ</th>
                      <th>Tür</th>
                      <th style={{ minWidth: 120 }}>Kategori</th>
                      <th>Risk</th>
                      <th>1G</th>
                      <th>1H</th>
                      <th>1A</th>
                      <th>3A</th>
                      <th>6A</th>
                      <th>YTD</th>
                      <th>1Y</th>
                      <th>Yön.Ücreti</th>
                      <th>Stopaj</th>
                      <th>RSI</th>
                      <th>RSI Sinyal</th>
                      <th>SMA50</th>
                      <th>SMA200</th>
                      <th>MA200↑</th>
                      <th>SMA Cross</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((f, i) => {
                      const rsiStyle = f.rsi_sinyal ? RSI_SINYAL_COLORS[f.rsi_sinyal] : null;
                      return (
                        <tr key={f.fon_kodu} style={{ background: i % 2 === 1 ? '#fafaf8' : undefined }}>
                          <td style={{ fontWeight: 700, position: 'sticky', left: 0, background: i % 2 === 1 ? '#fafaf8' : '#fff' }}>
                            {f.fon_kodu}
                          </td>
                          <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {f.unvan}
                          </td>
                          <td style={{ color: '#888', fontSize: 10 }}>{f.portfoy_yonetim_sirketi ?? '—'}</td>
                          <td>{FON_TIPI_LABELS[f.fon_tipi] ?? f.fon_tipi}</td>
                          <td style={{ fontSize: 10 }}>{f.fon_kategorisi ?? '—'}</td>
                          <td>
                            {f.risk_seviyesi != null && (
                              <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#92400e' }}>
                                {f.risk_seviyesi}/7
                              </span>
                            )}
                          </td>
                          <td style={{ fontWeight: 600, color: pctColor(f.getiri_1g) }}>{fmtPct(f.getiri_1g)}</td>
                          <td style={{ fontWeight: 600, color: pctColor(f.getiri_1h) }}>{fmtPct(f.getiri_1h)}</td>
                          <td style={{ fontWeight: 600, color: pctColor(f.getiri_1a) }}>{fmtPct(f.getiri_1a)}</td>
                          <td style={{ fontWeight: 600, color: pctColor(f.getiri_3a) }}>{fmtPct(f.getiri_3a)}</td>
                          <td style={{ fontWeight: 600, color: pctColor(f.getiri_6a) }}>{fmtPct(f.getiri_6a)}</td>
                          <td style={{ fontWeight: 600, color: pctColor(f.getiri_ytd) }}>{fmtPct(f.getiri_ytd)}</td>
                          <td style={{ fontWeight: 600, color: pctColor(f.getiri_1y) }}>{fmtPct(f.getiri_1y)}</td>
                          <td>{f.yonetim_ucreti != null ? `%${f.yonetim_ucreti}` : '—'}</td>
                          <td>{f.stopaj != null ? `%${f.stopaj}` : '—'}</td>
                          <td style={{ fontWeight: 600 }}>{fmtNum(f.rsi_14)}</td>
                          <td>
                            {rsiStyle && f.rsi_sinyal ? (
                              <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: rsiStyle.bg, color: rsiStyle.color }}>
                                {RSI_SINYAL_LABELS[f.rsi_sinyal]}
                              </span>
                            ) : '—'}
                          </td>
                          <td>{fmtNum(f.sma_50)}</td>
                          <td>{fmtNum(f.sma_200)}</td>
                          <td style={{ textAlign: 'center' }}><BoolIcon val={f.ma200_ustu} /></td>
                          <td style={{ textAlign: 'center' }}><BoolIcon val={f.sma_kesisim_20_50} /></td>
                        </tr>
                      );
                    })}
                    {results.length === 0 && (
                      <tr>
                        <td colSpan={21} style={{ textAlign: 'center', color: '#aaa', padding: 24 }}>
                          Sonuç bulunamadı.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Hisse Filtresi */}
      {mode === 'hisse' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="grid grid-3">
              <label>
                Hisse Senedi (BIST)
                <input className="input" placeholder="THYAO" value={tickerInput}
                  onChange={e => setTickerInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && searchHoldings()} />
              </label>
              <label>
                Min. Ağırlık (%)
                <input className="input" type="number" value={minWeight} onChange={e => setMinWeight(Number(e.target.value))} />
              </label>
              <label>
                Fon Türü
                <select className="input" value={holdingsFonTipi} onChange={e => setHoldingsFonTipi(e.target.value as FundKind)}>
                  <option value="YAT">Yatırım (YAT)</option>
                  <option value="EMK">Emeklilik (EMK)</option>
                  <option value="BYF">Borsa Yatırım (BYF)</option>
                </select>
              </label>
            </div>
            <button className="github-login-btn" style={{ marginTop: 12, background: '#5b21b6', color: '#fff' }}
              onClick={searchHoldings} disabled={holdingsLoading || !tickerInput.trim()}>
              {holdingsLoading ? 'Aranıyor...' : 'Ara'}
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}

          {holdingsResult && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div className="section-title" style={{ margin: 0 }}>
                  <span style={{ padding: '2px 10px', borderRadius: 999, background: '#ede9fe', color: '#5b21b6', fontWeight: 800, marginRight: 8 }}>
                    {holdingsResult.ticker}
                  </span>
                  tutan fonlar ({holdingsResult.fonlar.length})
                </div>
                {holdingsResult.rapor && (
                  <span style={{ fontSize: 10, color: '#aaa' }}>
                    Rapor: {holdingsResult.rapor.ay}/{holdingsResult.rapor.yil}
                  </span>
                )}
              </div>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr><th>Kod</th><th>Fon Adı</th><th>PYŞ</th><th>Ağırlık</th><th>1Y Getiri</th><th>Risk</th></tr>
                  </thead>
                  <tbody>
                    {holdingsResult.fonlar.map((f, i) => (
                      <tr key={f.fon_kodu} style={{ background: i % 2 === 1 ? '#fafaf8' : undefined }}>
                        <td style={{ fontWeight: 700, color: '#5b21b6' }}>{f.fon_kodu}</td>
                        <td style={{ fontSize: 11 }}>{f.unvan}</td>
                        <td style={{ fontSize: 10, color: '#888' }}>{f.portfoy_yonetim_sirketi ?? '—'}</td>
                        <td style={{ fontWeight: 700, color: '#2e7d32' }}>{f.agirlik.toFixed(1)}%</td>
                        <td style={{ fontWeight: 600, color: (f.getiri_1y ?? 0) >= 0 ? '#2e7d32' : '#c62828' }}>
                          {f.getiri_1y == null ? '—' : `${f.getiri_1y >= 0 ? '+' : ''}${f.getiri_1y.toFixed(1)}%`}
                        </td>
                        <td>
                          {f.risk_seviyesi != null && (
                            <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#92400e' }}>
                              {f.risk_seviyesi}/7
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FundScreenerPage;

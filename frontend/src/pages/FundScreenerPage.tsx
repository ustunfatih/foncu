import { useEffect, useState } from 'react';
import { fetchFundScreen, fetchHoldingsScreener } from '../api';
import { FundKind, HoldingsScreenerResult } from '../types';

type ScreenerMode = 'getiri' | 'hisse';

interface GetiriResult {
  code: string;
  title: string;
  kind: string;
  return1y: number | null;
  return1m: number | null;
  aum: number | null;
  riskLevel: number | null;
  manager: string | null;
  category: string | null;
}

const fmtPct = (n: number | null) => n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const fmtTRY = (n: number | null) => {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return `₺${(n / 1e9).toFixed(1)}B`;
  if (n >= 1_000_000) return `₺${(n / 1e6).toFixed(1)}M`;
  return `₺${n.toLocaleString('tr')}`;
};

const FundScreenerPage = () => {
  const [mode, setMode] = useState<ScreenerMode>('getiri');
  const [kind, setKind] = useState<FundKind>('YAT');
  const [minReturn1y, setMinReturn1y] = useState(20);
  const [minReturn1m, setMinReturn1m] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [getiriResults, setGetiriResults] = useState<GetiriResult[]>([]);

  // Hisse Filtresi state
  const [tickerInput, setTickerInput] = useState('');
  const [minWeight, setMinWeight] = useState(3);
  const [holdingsResult, setHoldingsResult] = useState<HoldingsScreenerResult | null>(null);
  const [holdingsLoading, setHoldingsLoading] = useState(false);

  const loadGetiriResults = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchFundScreen(kind, minReturn1y, minReturn1m) as unknown as GetiriResult[];
      setGetiriResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tarama başarısız');
    } finally {
      setLoading(false);
    }
  };

  const searchHoldings = async () => {
    if (!tickerInput.trim()) return;
    setHoldingsLoading(true);
    try {
      const data = await fetchHoldingsScreener({ ticker: tickerInput, minWeight, fundType: kind });
      setHoldingsResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Arama başarısız');
    } finally {
      setHoldingsLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'getiri') loadGetiriResults();
  }, [kind]);

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
            boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.10)' : 'none'
          }}>
            {m === 'getiri' ? 'Getiri Filtresi' : 'Hisse Filtresi ✦'}
          </button>
        ))}
      </div>

      {/* Getiri Filtresi */}
      {mode === 'getiri' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="grid grid-3">
              <label>
                Fon Türü
                <select className="input" value={kind} onChange={e => setKind(e.target.value as FundKind)}>
                  <option value="YAT">Yatırım (YAT)</option>
                  <option value="EMK">Emeklilik (EMK)</option>
                  <option value="BYF">Borsa Yatırım (BYF)</option>
                </select>
              </label>
              <label>
                Min 1Y Getiri (%)
                <input className="input" type="number" value={minReturn1y} onChange={e => setMinReturn1y(Number(e.target.value))} />
              </label>
              <label>
                Min 1M Getiri (%)
                <input className="input" type="number" value={minReturn1m} onChange={e => setMinReturn1m(Number(e.target.value))} />
              </label>
            </div>
            <button className="github-login-btn" style={{ marginTop: 12 }} onClick={loadGetiriResults} disabled={loading}>
              {loading ? 'Taranıyor...' : 'Taramayı Çalıştır'}
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <div className="card">
            <div className="section-title">Sonuçlar ({getiriResults.length})</div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Kod</th><th>Fon</th><th>PYŞ</th><th>1M</th><th>1Y</th><th>AUM</th><th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {getiriResults.map((f, i) => (
                    <tr key={f.code} style={{ background: i % 2 === 1 ? '#fafaf8' : undefined }}>
                      <td style={{ fontWeight: 700 }}>{f.code}</td>
                      <td style={{ fontSize: 11 }}>{f.title}</td>
                      <td style={{ fontSize: 10, color: '#888' }}>{f.manager ?? '—'}</td>
                      <td style={{ fontWeight: 600, color: (f.return1m ?? 0) >= 0 ? '#2e7d32' : '#c62828' }}>{fmtPct(f.return1m)}</td>
                      <td style={{ fontWeight: 600, color: (f.return1y ?? 0) >= 0 ? '#2e7d32' : '#c62828' }}>{fmtPct(f.return1y)}</td>
                      <td style={{ fontSize: 11 }}>{fmtTRY(f.aum)}</td>
                      <td>
                        {f.riskLevel != null && (
                          <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: '#fef3c7', color: '#92400e' }}>
                            {f.riskLevel}/7
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
                <select className="input" value={kind} onChange={e => setKind(e.target.value as FundKind)}>
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
                          {fmtPct(f.getiri_1y)}
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

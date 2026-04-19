import { useEffect, useState } from 'react';
import { FundProfile } from '../types';
import { fetchFundProfile } from '../api';

// Fund tag colors indexed 0-4 (consistent across session)
const FUND_COLORS = [
  { bg: '#ede9fe', text: '#5b21b6' },
  { bg: '#dbeafe', text: '#1e40af' },
  { bg: '#d1fae5', text: '#065f46' },
  { bg: '#fef3c7', text: '#92400e' },
  { bg: '#fce7f3', text: '#9d174d' },
];

const ASSET_COLORS = ['#a5b4fc', '#86efac', '#fde68a', '#f9a8d4', '#6ee7b7'];

interface Props {
  fundCode: string | null;
  fundIndex: number;
  onClose: () => void;
  onAddToOverlap: (code: string) => void;
}

export function FundProfileDrawer({ fundCode, fundIndex, onClose, onAddToOverlap }: Props) {
  const [profile, setProfile] = useState<FundProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!fundCode) return;
    navigator.clipboard.writeText(fundCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!fundCode) { setProfile(null); return; }
    setLoading(true);
    setError(null);
    fetchFundProfile(fundCode)
      .then(setProfile)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [fundCode]);

  if (!fundCode) return null;

  const color = FUND_COLORS[fundIndex % FUND_COLORS.length];
  const fmt = (n: number | null, dec = 1) => n == null ? '—' : n.toFixed(dec);
  const fmtPct = (n: number | null) => n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
  const fmtTRY = (n: number | null) => {
    if (n == null) return '—';
    if (n >= 1_000_000_000) return `₺${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`;
    return `₺${n.toLocaleString('tr')}`;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)', zIndex: 49 }}
        onClick={onClose}
      />
      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 340,
        background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        borderLeft: '1px solid #e8e6e1', display: 'flex', flexDirection: 'column',
        zIndex: 50, overflowY: 'hidden'
      }}>
        {/* Header */}
        <div style={{ padding: '16px 16px 12px', background: '#f5f4f0', borderBottom: '1px solid #e8e6e1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: color.text, letterSpacing: '-0.5px' }}>
                  {fundCode}
                </div>
                <button
                  onClick={handleCopyCode}
                  title="Kodu Kopyala"
                  aria-label="Fon kodunu kopyala"
                  style={{
                    background: 'none', border: 'none', padding: '4px', cursor: 'pointer',
                    color: copied ? '#059669' : '#9ca3af', display: 'flex', transition: 'color 0.2s'
                  }}
                >
                  {copied ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2, lineHeight: 1.4, maxWidth: 260 }}>
                {loading ? 'Yükleniyor...' : (profile?.unvan ?? '')}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Kapat"
              style={{
                border: '1px solid #ddd', borderRadius: 6, padding: '4px 8px',
                fontSize: 12, color: '#888', background: '#fff', cursor: 'pointer'
              }}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          {profile && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {profile.fon_kategorisi && (
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, fontWeight: 600, background: color.bg, color: color.text }}>
                  {profile.fon_kategorisi}
                </span>
              )}
              {profile.risk_seviyesi && (
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, fontWeight: 600, background: '#fef3c7', color: '#92400e' }}>
                  Risk {profile.risk_seviyesi}/7
                </span>
              )}
              {profile.tefasa_acik && (
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, fontWeight: 600, background: '#d1fae5', color: '#065f46' }}>
                  TEFAS
                </span>
              )}
              {profile.stopaj === 0 && (
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, fontWeight: 600, background: '#dbeafe', color: '#1e40af' }}>
                  Stopaj: %0
                </span>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {error && <div style={{ color: '#c62828', fontSize: 12, marginBottom: 12 }}>{error}</div>}
          {loading && <div style={{ color: '#888', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>Yükleniyor...</div>}
          {!loading && profile && (
            <>
              {/* Key stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 14 }}>
                {[
                  { label: '1Y Getiri', value: fmtPct(profile.metriks.getiri_1y), pos: (profile.metriks.getiri_1y ?? 0) >= 0 },
                  { label: '1M Getiri', value: fmtPct(profile.metriks.getiri_1a), pos: (profile.metriks.getiri_1a ?? 0) >= 0 },
                  { label: 'AUM', value: fmtTRY(profile.metriks.fon_buyuklugu), pos: null },
                  { label: 'Yönetim Ücreti', value: `%${fmt(profile.yonetim_ucreti, 2)}`, pos: null },
                  { label: 'Sharpe', value: fmt(profile.metriks.sharpe, 2), pos: (profile.metriks.sharpe ?? 0) >= 1 },
                  { label: 'Max DD', value: fmtPct(profile.metriks.max_drawdown), pos: false },
                ].map(stat => (
                  <div key={stat.label} style={{ background: '#f5f4f0', borderRadius: 8, padding: '7px 8px' }}>
                    <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#aaa', marginBottom: 2 }}>
                      {stat.label}
                    </div>
                    <div style={{
                      fontSize: 12, fontWeight: 700,
                      color: stat.pos === true ? '#2e7d32' : stat.pos === false ? '#c62828' : '#222'
                    }}>
                      {stat.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Manager */}
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#aaa', marginBottom: 2 }}>PYŞ</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 2 }}>{profile.portfoy_yonetim_sirketi ?? '—'}</div>
              <div style={{ fontSize: 9, color: '#bbb', marginBottom: 14 }}>
                Alış T+{profile.alis_valoru ?? '?'} · Satış T+{profile.satis_valoru ?? '?'}
              </div>

              {/* Asset allocation */}
              {profile.varlik_dagilimi.length > 0 && (
                <>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#aaa', marginBottom: 6 }}>
                    Varlık Dağılımı {profile.rapor ? `(${profile.rapor.ay}/${profile.rapor.yil})` : ''}
                  </div>
                  <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 10, marginBottom: 6 }}>
                    {profile.varlik_dagilimi.slice(0, 5).map((v, i) => (
                      <div key={v.kod} style={{ width: `${v.agirlik}%`, background: ASSET_COLORS[i] }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 14 }}>
                    {profile.varlik_dagilimi.slice(0, 5).map((v, i) => (
                      <span key={v.kod} style={{ fontSize: 9, color: '#666' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 3, verticalAlign: 'middle', background: ASSET_COLORS[i] }} />
                        {v.ad} {v.agirlik.toFixed(0)}%
                      </span>
                    ))}
                  </div>
                </>
              )}

              {/* Top holdings */}
              {profile.topHoldings.length > 0 && (
                <>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#aaa', marginBottom: 8 }}>
                    En Büyük Hisseler
                  </div>
                  {profile.topHoldings.map(h => (
                    <div key={h.ticker} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#444', width: 48 }}>{h.ticker}</span>
                      <div style={{ flex: 1, background: '#f0f0ee', borderRadius: 99, height: 6 }}>
                        <div style={{ height: 6, borderRadius: 99, background: color.bg, width: `${Math.min(h.agirlik * 6, 100)}%`, outline: `2px solid ${color.text}22` }} />
                      </div>
                      <span style={{ fontSize: 11, color: '#777', width: 36, textAlign: 'right' }}>{h.agirlik.toFixed(1)}%</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid #e8e6e1', display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 500,
            border: '1px solid #ddd', borderRadius: 8, color: '#555', background: '#fff', cursor: 'pointer'
          }}>
            Kapat
          </button>
          <button
            onClick={() => { onAddToOverlap(fundCode); onClose(); }}
            style={{
              flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 700,
              border: 'none', borderRadius: 8, color: '#fff', background: '#5b21b6', cursor: 'pointer'
            }}
          >
            Örtüşme'ye Gönder →
          </button>
        </div>
      </div>
    </>
  );
}

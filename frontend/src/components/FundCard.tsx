import { memo } from 'react';
import { FundOverview } from '../types';
import { formatSharpeRatio } from '../utils/analytics';
import { formatTry6 } from '../utils/format';

interface Props {
  fund: FundOverview;
  sharpeRatio?: number | null;
  onRemove: (code: string) => void;
  color?: string;
}

const FundCard = memo(({ fund, sharpeRatio = null, onRemove, color }: Props) => {
  // Get latest price from priceHistory
  const latestPrice = fund.priceHistory && fund.priceHistory.length > 0
    ? fund.priceHistory[fund.priceHistory.length - 1].value
    : null;

  return (
    <div className="card fund-card" style={color ? { borderLeftColor: color } : undefined}>
      <div className="fund-card-header">
        <div className="fund-card-header-left">
          <div className="fund-code-wrapper" onClick={handleCopy} title="Kodu Kopyala">
            <span className="fund-card-code">{fund.code}</span>
            <span className={`copy-badge ${copied ? 'visible' : ''}`}>
              {copied ? 'Kopyalandı!' : ''}
            </span>
            <button
              className={`copy-btn ${copied ? 'copied' : ''}`}
              aria-label={`${fund.code} kodunu kopyala`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {copied ? (
                  <polyline points="20 6 9 17 4 12" />
                ) : (
                  <>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </>
                )}
              </svg>
            </button>
          </div>
          {sharpeRatio !== null && (
            <span className="fund-card-sharpe" title="Sharpe Oranı: Fonun birim risk başına getirisini ölçer.">
              SR: {formatSharpeRatio(sharpeRatio)}
            </span>
          )}
        </div>
        <button
          className="remove-btn"
          aria-label={`${fund.code} fonunu kaldır`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove(fund.code);
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {latestPrice !== null && (
        <div className="fund-card-price">{formatTry6(latestPrice)}</div>
      )}

      <div className="fund-card-title">{fund.title}</div>
    </div>
  );
});

export default FundCard;

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
          <span className="fund-card-code">{fund.code}</span>
          {sharpeRatio !== null && (
            <span className="fund-card-sharpe" title="Sharpe Ratio">
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

import { FundOverview } from '../types';
import { calculateSharpeRatio, formatSharpeRatio } from '../utils/analytics';
import { formatTry6 } from '../utils/format';

interface Props {
  fund: FundOverview;
  onRemove: (code: string) => void;
  color?: string;
}

const FundCard = ({ fund, onRemove, color }: Props) => {
  const latestPrice = fund.priceHistory && fund.priceHistory.length > 0
    ? fund.priceHistory[fund.priceHistory.length - 1].value
    : null;

  const previousPrice = fund.priceHistory && fund.priceHistory.length > 1
    ? fund.priceHistory[fund.priceHistory.length - 2].value
    : null;

  const priceChange = latestPrice && previousPrice
    ? ((latestPrice - previousPrice) / previousPrice) * 100
    : null;

  const sharpeRatio = fund.priceHistory && fund.priceHistory.length > 0
    ? calculateSharpeRatio(fund.priceHistory)
    : null;

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(fund.code);
  };

  return (
    <div 
      className="card fund-card card-interactive" 
      style={color ? { borderLeftColor: color, '--accent-color': color } as React.CSSProperties : undefined}
      role="article"
      aria-label={`Fund ${fund.code}: ${fund.title}`}
    >
      <div className="fund-card-header">
        <div className="fund-card-header-left">
          <span className="fund-card-code">{fund.code}</span>
          {sharpeRatio !== null && (
            <span 
              className="fund-card-sharpe" 
              title="Sharpe Ratio"
              aria-label={`Sharpe Ratio: ${formatSharpeRatio(sharpeRatio)}`}
            >
              SR: {formatSharpeRatio(sharpeRatio)}
            </span>
          )}
        </div>
        <button 
          className="remove-btn" 
          onClick={handleRemove}
          aria-label={`Remove ${fund.code} from selection`}
          title="Remove fund"
        >
          ×
        </button>
      </div>

      {latestPrice !== null && (
        <div className="fund-card-price-row">
          <span className="fund-card-price">{formatTry6(latestPrice)}</span>
          {priceChange !== null && (
            <span 
              className={`performance-badge ${priceChange >= 0 ? 'positive' : 'negative'}`}
              aria-label={`Change: ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`}
            >
              {priceChange >= 0 ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="18 15 12 9 6 15"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              )}
              {Math.abs(priceChange).toFixed(2)}%
            </span>
          )}
        </div>
      )}

      <div className="fund-card-title">{fund.title}</div>
    </div>
  );
};

export default FundCard;
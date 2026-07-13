import { HistoricalPoint } from '../types';

/**
 * NAV, market-cap, and investor histories are strictly positive series.
 * A zero/non-finite value represents an unavailable observation, not a real
 * market value, and must be omitted so charts can bridge market-closure gaps.
 */
export const sanitizeHistoricalSeries = (series: HistoricalPoint[] | undefined): HistoricalPoint[] => (
  (series || []).filter((point) => Number.isFinite(point.value) && point.value > 0)
);

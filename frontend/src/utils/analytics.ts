import { HistoricalPoint } from '../types';

/**
 * Calculate daily returns from price history
 */
export const calculateDailyReturns = (history: HistoricalPoint[]): number[] => {
    const returns: number[] = [];
    for (let i = 1; i < history.length; i++) {
        const prevPrice = history[i - 1].value;
        const currentPrice = history[i].value;
        if (prevPrice > 0) {
            returns.push((currentPrice - prevPrice) / prevPrice);
        }
    }
    return returns;
};

/**
 * Calculate mean (average) of an array
 */
export const calculateMean = (values: number[]): number => {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
};

/**
 * Calculate standard deviation
 */
export const calculateStdDev = (values: number[]): number => {
    if (values.length === 0) return 0;
    const mean = calculateMean(values);
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = calculateMean(squaredDiffs);
    return Math.sqrt(variance);
};

/**
 * Calculate Sharpe Ratio
 * Assumes risk-free rate of 0 for simplicity
 * Annualized using 252 trading days
 */
export const calculateSharpeRatio = (history: HistoricalPoint[]): number | null => {
    if (!history || history.length < 10) return null; // Need at least 10 days

    const returns = calculateDailyReturns(history);
    if (returns.length === 0) return null;

    const meanReturn = calculateMean(returns);
    const stdDev = calculateStdDev(returns);

    if (stdDev === 0 || isNaN(stdDev) || isNaN(meanReturn)) return null;

    // Annualize: multiply by sqrt(252) for daily data
    const sharpeRatio = (meanReturn / stdDev) * Math.sqrt(252);

    if (isNaN(sharpeRatio) || !isFinite(sharpeRatio)) return null;

    return sharpeRatio;
};

/**
 * Calculate annualized volatility (standard deviation)
 */
export const calculateVolatility = (history: HistoricalPoint[]): number | null => {
    if (!history || history.length < 10) return null;

    const returns = calculateDailyReturns(history);
    if (returns.length === 0) return null;

    const stdDev = calculateStdDev(returns);

    if (isNaN(stdDev) || stdDev === 0) return null;

    // Annualize: multiply by sqrt(252)
    const volatility = stdDev * Math.sqrt(252);

    if (isNaN(volatility) || !isFinite(volatility)) return null;

    return volatility;
};

/**
 * Calculate maximum drawdown (largest peak-to-trough decline)
 */
export const calculateMaxDrawdown = (history: HistoricalPoint[]): number | null => {
    if (!history || history.length < 2) return null;

    let maxDrawdown = 0;
    let peak = history[0].value;

    if (!peak || peak <= 0) return null;

    for (let i = 1; i < history.length; i++) {
        const currentPrice = history[i].value;
        if (!currentPrice || currentPrice < 0) continue;

        if (currentPrice > peak) {
            peak = currentPrice;
        }
        const drawdown = (peak - currentPrice) / peak;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }
    }

    if (isNaN(maxDrawdown) || !isFinite(maxDrawdown)) return null;

    return maxDrawdown;
};

/**
 * Format Sharpe ratio for display
 */
export const formatSharpeRatio = (sharpe: number | null): string => {
    if (sharpe === null) return 'N/A';
    return sharpe.toFixed(2);
};

/**
 * Format volatility for display (as percentage)
 */
export const formatVolatility = (vol: number | null): string => {
    if (vol === null) return 'N/A';
    return `${(vol * 100).toFixed(1)}%`;
};

/**
 * Format max drawdown for display (as percentage)
 */
export const formatMaxDrawdown = (dd: number | null): string => {
    if (dd === null) return 'N/A';
    return `${(dd * 100).toFixed(1)}%`;
};

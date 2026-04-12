/**
 * Compute weighted Jaccard similarity between two fund weight maps.
 * @param {Object<string, number>} weightsA - { ticker: weight } for fund A (weights in [0,1])
 * @param {Object<string, number>} weightsB - { ticker: weight } for fund B (weights in [0,1])
 * @returns {number} similarity in [0, 1]
 */
function weightedJaccard(weightsA, weightsB) {
  const union = new Set([...Object.keys(weightsA), ...Object.keys(weightsB)]);
  if (!union.size) return 0;

  let minSum = 0;
  let maxSum = 0;

  for (const ticker of union) {
    const a = weightsA[ticker] ?? 0;
    const b = weightsB[ticker] ?? 0;
    minSum += Math.min(a, b);
    maxSum += Math.max(a, b);
  }

  return maxSum === 0 ? 0 : minSum / maxSum;
}

/**
 * Group flat holdings rows into { fundCode: { ticker: weight } } map.
 * Normalises yuzdesel_agirlik (percentage 0-100) to decimal fraction (0-1).
 * @param {Array<{ fon_kodu, hisse_kodu, yuzdesel_agirlik }>} rows
 * @returns {Object}
 */
function groupByFund(rows) {
  const map = {};
  for (const row of rows) {
    if (!map[row.fon_kodu]) map[row.fon_kodu] = {};
    map[row.fon_kodu][row.hisse_kodu] = (row.yuzdesel_agirlik ?? 0) / 100;
  }
  return map;
}

/**
 * Build the full pairwise overlap matrix.
 * @param {Object} holdingsByFund - output of groupByFund
 * @returns {Object} nested matrix: { fundA: { fundB: { pct, sharedCount } } }
 *   pct is already multiplied by 100 (percentage, rounded to 1dp)
 */
function buildMatrix(holdingsByFund) {
  const funds = Object.keys(holdingsByFund);
  const matrix = {};

  for (const fund of funds) {
    matrix[fund] = {};
  }

  for (let i = 0; i < funds.length; i++) {
    const fundA = funds[i];
    for (let j = i + 1; j < funds.length; j++) {
      const fundB = funds[j];
      const wA = holdingsByFund[fundA];
      const wB = holdingsByFund[fundB];

      const pct = weightedJaccard(wA, wB);
      const sharedCount = Object.keys(wA).filter(t => wB[t] !== undefined).length;

      const result = { pct: Math.round(pct * 1000) / 10, sharedCount };
      matrix[fundA][fundB] = result;
      matrix[fundB][fundA] = result;
    }
  }

  return matrix;
}

module.exports = { weightedJaccard, groupByFund, buildMatrix };

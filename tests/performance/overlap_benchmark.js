const { buildMatrix } = require('../../api/_lib/overlap-calc');

function generateMockHoldings(numFunds, holdingsPerFund) {
  const holdingsByFund = {};
  for (let i = 0; i < numFunds; i++) {
    const fundCode = `FUND_${i}`;
    holdingsByFund[fundCode] = {};
    for (let j = 0; j < holdingsPerFund; j++) {
      const ticker = `TICKER_${Math.floor(Math.random() * holdingsPerFund * 2)}`;
      holdingsByFund[fundCode][ticker] = Math.random();
    }
  }
  return holdingsByFund;
}

function runBenchmark(holdingsByFund, iterations = 50) {
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    buildMatrix(holdingsByFund);
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1000000);
  }

  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const average = times.reduce((a, b) => a + b, 0) / times.length;
  const min = times[0];
  const max = times[times.length - 1];

  return { median, average, min, max, iterations };
}

const numFunds = 100;
const holdingsPerFund = 100;
const holdings = generateMockHoldings(numFunds, holdingsPerFund);

console.log(`Benchmarking with ${numFunds} funds and ~${holdingsPerFund} holdings per fund...`);

// Warm up
runBenchmark(holdings, 10);

// Actual benchmark
const stats = runBenchmark(holdings, 50);
console.log(`Iterations: ${stats.iterations}`);
console.log(`Average: ${stats.average.toFixed(4)} ms`);
console.log(`Median: ${stats.median.toFixed(4)} ms`);
console.log(`Min: ${stats.min.toFixed(4)} ms`);
console.log(`Max: ${stats.max.toFixed(4)} ms`);
console.log(`RESULT_MEDIAN: ${stats.median}`);

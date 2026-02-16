
const { calculateSma } = require('../api/_lib/analytics');

// Mock data generator
const generateHistory = (length) => {
  const history = [];
  const now = new Date();
  for (let i = 0; i < length; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - (length - i));
    history.push({
      date: date.toISOString(),
      value: 100 + Math.random() * 50
    });
  }
  return history;
};

// Optimized implementation
const calculateSmaTail = (points, period) => {
  if (!Array.isArray(points) || points.length < period || period <= 0) return [];

  const result = [];
  const len = points.length;

  // We need the last 2 SMA points.
  // If we can't even get 1 point, return empty.
  if (len < period) return [];

  // If we can only get 1 point (len == period)
  if (len === period) {
     let sum = 0;
     for (let i = 0; i < period; i++) sum += points[i].value;
     result.push({ date: points[len-1].date, value: sum / period });
     return result;
  }

  // Calculate sum for the second to last window
  // Window ends at len - 2.
  // Start index: (len - 2) - period + 1 = len - period - 1
  let sum = 0;
  const secondLastEnd = len - 2;
  const secondLastStart = secondLastEnd - period + 1;

  for (let i = secondLastStart; i <= secondLastEnd; i++) {
    sum += points[i].value;
  }

  result.push({ date: points[secondLastEnd].date, value: sum / period });

  // Calculate sum for the last window
  // Window ends at len - 1.
  // Slide the window: remove element at secondLastStart, add element at len - 1

  sum = sum - points[secondLastStart].value + points[len - 1].value;
  result.push({ date: points[len - 1].date, value: sum / period });

  return result;
};

const runBenchmark = () => {
  const historyLength = 365; // Typical 1 year history
  const shortPeriod = 20;
  const longPeriod = 50;
  const iterations = 10000;

  const history = generateHistory(historyLength);

  console.log(`Benchmarking SMA calculation with history length ${historyLength}, iterations ${iterations}`);

  // Baseline: calculateSma (Short)
  const startBaseShort = process.hrtime();
  for (let i = 0; i < iterations; i++) {
    calculateSma(history, shortPeriod);
  }
  const endBaseShort = process.hrtime(startBaseShort);
  const timeBaseShort = endBaseShort[0] * 1000 + endBaseShort[1] / 1e6;
  console.log(`Baseline (Short Period ${shortPeriod}): ${timeBaseShort.toFixed(2)} ms`);

  // Optimized: calculateSmaTail (Short)
  const startOptShort = process.hrtime();
  for (let i = 0; i < iterations; i++) {
    calculateSmaTail(history, shortPeriod);
  }
  const endOptShort = process.hrtime(startOptShort);
  const timeOptShort = endOptShort[0] * 1000 + endOptShort[1] / 1e6;
  console.log(`Optimized (Short Period ${shortPeriod}): ${timeOptShort.toFixed(2)} ms`);

  // Baseline: calculateSma (Long)
  const startBaseLong = process.hrtime();
  for (let i = 0; i < iterations; i++) {
    calculateSma(history, longPeriod);
  }
  const endBaseLong = process.hrtime(startBaseLong);
  const timeBaseLong = endBaseLong[0] * 1000 + endBaseLong[1] / 1e6;
  console.log(`Baseline (Long Period ${longPeriod}): ${timeBaseLong.toFixed(2)} ms`);

  // Optimized: calculateSmaTail (Long)
  const startOptLong = process.hrtime();
  for (let i = 0; i < iterations; i++) {
    calculateSmaTail(history, longPeriod);
  }
  const endOptLong = process.hrtime(startOptLong);
  const timeOptLong = endOptLong[0] * 1000 + endOptLong[1] / 1e6;
  console.log(`Optimized (Long Period ${longPeriod}): ${timeOptLong.toFixed(2)} ms`);

  // Verification
  const baseResult = calculateSma(history, longPeriod);
  const baseTail = baseResult.slice(-2);
  const optResult = calculateSmaTail(history, longPeriod);

  console.log('\nVerification:');
  console.log('Base tail:', baseTail);
  console.log('Opt result:', optResult);

  const isMatch = baseTail.length === optResult.length &&
                  baseTail[0].value.toFixed(6) === optResult[0].value.toFixed(6) &&
                  baseTail[1].value.toFixed(6) === optResult[1].value.toFixed(6);

  console.log('Results match:', isMatch);
};

runBenchmark();

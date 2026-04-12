const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(path) {
  if (path === './supabase' || path === '@supabase/supabase-js') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

const { normalizeCode } = require('../../api/_lib/history');

function originalMethod(codes) {
  return codes
    .map(normalizeCode)
    .filter((code, index, array) => code && array.indexOf(code) === index);
}

function optimizedMethod(codes) {
  return [...new Set(codes.map(normalizeCode))].filter(Boolean);
}

const testSizes = [10, 100, 1000, 5000];
const iterations = 100;

function generateCodes(size) {
  const codes = [];
  for (let i = 0; i < size; i++) {
    codes.push(`FUND${Math.floor(i / 2)}`);
  }
  return codes;
}

console.log('--- Benchmarking Array Deduplication ---');
for (const size of testSizes) {
  const codes = generateCodes(size);

  const startOrig = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    originalMethod(codes);
  }
  const endOrig = process.hrtime.bigint();
  const timeOrig = Number(endOrig - startOrig) / 1000000;

  const startOpt = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    optimizedMethod(codes);
  }
  const endOpt = process.hrtime.bigint();
  const timeOpt = Number(endOpt - startOpt) / 1000000;

  console.log(`Size: ${size}`);
  console.log(`  Original: ${timeOrig.toFixed(4)} ms`);
  console.log(`  Optimized: ${timeOpt.toFixed(4)} ms`);
  console.log(`  Improvement: ${((timeOrig - timeOpt) / timeOrig * 100).toFixed(2)}%`);
  console.log('---');
}

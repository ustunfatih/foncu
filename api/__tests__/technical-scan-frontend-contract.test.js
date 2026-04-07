const fs = require('fs');
const path = require('path');

const FRONTEND_API = path.join(__dirname, '../../frontend/src/api.ts');
const FRONTEND_TYPES = path.join(__dirname, '../../frontend/src/types.ts');
const SCANNER_PAGE = path.join(__dirname, '../../frontend/src/pages/TechnicalScannerPage.tsx');

test('frontend API sends canonical rsiThreshold query param', () => {
  const apiSource = fs.readFileSync(FRONTEND_API, 'utf8');
  expect(apiSource).toContain("url.searchParams.append('rsiThreshold'");
  expect(apiSource).not.toContain("url.searchParams.append('rsiBelow'");
});

test('technical scan type and scanner page use canonical field names', () => {
  const typesSource = fs.readFileSync(FRONTEND_TYPES, 'utf8');
  const pageSource = fs.readFileSync(SCANNER_PAGE, 'utf8');

  ['rsi', 'sma20', 'sma50', 'smaCrossover'].forEach((field) => {
    expect(typesSource).toContain(`${field}:`);
    expect(pageSource).toContain(`fund.${field}`);
  });

  expect(typesSource).not.toContain('shortSma');
  expect(typesSource).not.toContain('longSma');
  expect(typesSource).not.toMatch(/\bsmaCross\s*:/);
  expect(pageSource).not.toContain('shortSma');
  expect(pageSource).not.toContain('longSma');
  expect(pageSource).not.toMatch(/fund\.smaCross\b/);
});

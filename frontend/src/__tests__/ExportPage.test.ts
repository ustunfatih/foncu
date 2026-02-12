import { sanitizeCSV } from '../pages/ExportPage';

// Mock dependencies
jest.mock('../api', () => ({
  fetchFunds: jest.fn(),
  fetchFundDetails: jest.fn(),
}));

describe('sanitizeCSV', () => {
  it('should escape double quotes', () => {
    expect(sanitizeCSV('Test "Quote"')).toBe('Test ""Quote""');
  });

  it('should neutralize formula-triggering characters with apostrophe', () => {
    expect(sanitizeCSV('=CMD')).toBe("'=CMD");
    expect(sanitizeCSV('+CMD')).toBe("'+CMD");
    expect(sanitizeCSV('-CMD')).toBe("'-CMD");
    expect(sanitizeCSV('@CMD')).toBe("'@CMD");
  });

  it('should not modify safe strings', () => {
    expect(sanitizeCSV('Normal Fund Name')).toBe('Normal Fund Name');
    expect(sanitizeCSV('ABC123')).toBe('ABC123');
  });

  it('should handle empty strings', () => {
    expect(sanitizeCSV('')).toBe('');
  });

  it('should handle strings with both quotes and formulas', () => {
    expect(sanitizeCSV('="Formula"')).toBe("'=\"Formula\""");
  });
});

import { formatTry, formatTry6 } from '../utils/format';

describe('format utilities', () => {
  describe('formatTry', () => {
    it('should format numbers with Turkish locale', () => {
      expect(formatTry(1234567.89)).toBe('1.234.567,89 ₺');
    });

    it('should handle zero', () => {
      expect(formatTry(0)).toBe('0,00 ₺');
    });

    it('should handle negative numbers', () => {
      expect(formatTry(-1000)).toBe('-1.000,00 ₺');
    });
  });

  describe('formatTry6', () => {
    it('should format with 6 decimal places', () => {
      expect(formatTry6(1.12345678)).toContain('1,123457');
    });
  });
});

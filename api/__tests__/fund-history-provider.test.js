const {
  buildDateChunks,
  buildHistoricalUpsertRows,
  requiresLongHorizonBackfill,
} = require('../_lib/providers/fund-history-provider');

describe('fund-history-provider helpers', () => {
  test('splits long ranges into TEFAS-sized chunks', () => {
    expect(
      buildDateChunks('2026-01-01', '2026-04-10', 90)
    ).toEqual([
      { start: '01.01.2026', end: '10.01.2026' },
      { start: '11.01.2026', end: '10.04.2026' },
    ]);
  });

  test('maps TEFAS history rows into historical_data upserts', () => {
    const rows = buildHistoricalUpsertRows('AAA', [
      {
        TARIH: new Date('2026-03-01T00:00:00Z').getTime().toString(),
        FIYAT: '12.34',
        PORTFOYBUYUKLUK: '123456',
        KISISAYISI: '789',
      },
      {
        TARIH: new Date('2026-03-01T00:00:00Z').getTime().toString(),
        FIYAT: '12.50',
        PORTFOYBUYUKLUK: '123999',
        KISISAYISI: '790',
      },
      {
        TARIH: new Date('2026-03-02T00:00:00Z').getTime().toString(),
        FIYAT: '12.60',
      },
    ]);

    expect(rows).toEqual([
      {
        fund_code: 'AAA',
        date: '2026-03-01',
        price: 12.5,
        market_cap: 123999,
        investor_count: 790,
      },
      {
        fund_code: 'AAA',
        date: '2026-03-02',
        price: 12.6,
        market_cap: 0,
        investor_count: 0,
      },
    ]);
  });

  test('detects when long-horizon returns still need a backfill', () => {
    expect(
      requiresLongHorizonBackfill({
        getiri_3a: 5,
        getiri_6a: null,
        getiri_1y: 12,
      })
    ).toBe(true);

    expect(
      requiresLongHorizonBackfill({
        getiri_3a: 5,
        getiri_6a: 10,
        getiri_1y: 12,
      })
    ).toBe(false);
  });
});

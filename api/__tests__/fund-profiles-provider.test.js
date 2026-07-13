const {
  buildAllocationItems,
  buildAllocationUpdateRow,
  buildSnapshotHistoryRow,
  fetchLatestSnapshotRows,
  getLatestCompletedBusinessDate,
} = require('../_lib/providers/fund-profiles-provider');

describe('fund-profiles-provider allocation helpers', () => {
  test('builds sorted allocation items from normalized TEFAS rows', () => {
    expect(buildAllocationItems({
      FONKODU: 'AK3',
      FONUNVAN: 'Ak Portföy',
      TARIH: '1783641600000',
      BilFiyat: '123',
      HS: 88.8,
      TR: 3.41,
      BYF: 0.05,
    })).toEqual([
      { kod: 'HS', ad: 'Hisse Senedi', agirlik: 88.8 },
      { kod: 'TR', ad: 'Ters Repo', agirlik: 3.41 },
      { kod: 'BYF', ad: 'Borsa Yatırım Fonu', agirlik: 0.05 },
    ]);
  });

  test('includes required profile identity fields for newly listed allocation funds', () => {
    const refreshedAt = '2026-07-13T10:00:00.000Z';
    expect(buildAllocationUpdateRow({
      FONKODU: 'new',
      FONUNVAN: 'Yeni Fon',
      HS: 100,
    }, refreshedAt)).toEqual({
      fon_kodu: 'NEW',
      unvan: 'Yeni Fon',
      varlik_dagilimi: [{ kod: 'HS', ad: 'Hisse Senedi', agirlik: 100 }],
      guncelleme_zamani: refreshedAt,
    });
  });

  test('falls back to the code when TEFAS omits a title', () => {
    expect(buildAllocationUpdateRow({ FONKODU: 'ABC' }, '2026-07-13T10:00:00.000Z'))
      .toMatchObject({ fon_kodu: 'ABC', unvan: 'ABC' });
  });

  test('builds a current historical_data row from the nightly snapshot', () => {
    expect(buildSnapshotHistoryRow({
      FONKODU: 'ak3',
      TARIH: String(Date.parse('2026-07-13T00:00:00Z')),
      FIYAT: 50.88,
      PORTFOYBUYUKLUK: 7175276093,
      KISISAYISI: 20909,
    })).toEqual({
      fund_code: 'AK3',
      date: '2026-07-13',
      price: 50.88,
      market_cap: 7175276093,
      investor_count: 20909,
    });
  });

  test('does not persist a snapshot when its price is unavailable', () => {
    expect(buildSnapshotHistoryRow({
      FONKODU: 'ak3',
      TARIH: String(Date.parse('2026-07-13T00:00:00Z')),
      FIYAT: 0,
    })).toBeNull();
  });

  test('uses the latest completed business day for allocation reports', () => {
    expect(getLatestCompletedBusinessDate(new Date('2026-07-13T10:00:00Z')).toISOString())
      .toBe('2026-07-10T00:00:00.000Z');
    expect(getLatestCompletedBusinessDate(new Date('2026-07-13T23:00:00Z')).toISOString())
      .toBe('2026-07-13T00:00:00.000Z');
    expect(getLatestCompletedBusinessDate(new Date('2026-07-12T23:00:00Z')).toISOString())
      .toBe('2026-07-10T00:00:00.000Z');
  });

  test('skips unavailable snapshot dates and falls back safely', async () => {
    const fetcher = jest.fn()
      .mockRejectedValueOnce(new Error('holiday'))
      .mockResolvedValueOnce([{ FONKODU: 'AK3' }]);
    const log = [];

    const snapshot = await fetchLatestSnapshotRows(
      fetcher,
      'YAT',
      '',
      log,
      'allocation',
      { baseDate: new Date('2026-07-13T00:00:00Z') }
    );

    expect(snapshot.date).toBe('12.07.2026');
    expect(snapshot.rows).toEqual([{ FONKODU: 'AK3' }]);
    expect(log[0]).toContain('trying earlier date');
  });
});

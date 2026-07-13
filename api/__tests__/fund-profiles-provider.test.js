const {
  buildAllocationItems,
  buildAllocationUpdateRow,
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
});

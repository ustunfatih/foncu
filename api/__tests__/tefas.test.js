const {
  ROOT_URL,
  INFO_ENDPOINT,
  DETAIL_ENDPOINT,
  formatDate,
  toApiDate,
  buildRequestPayload,
  normalizeInfoRow,
  normalizeAllocationRow,
  fetchInfo,
  fetchAllocation,
  fetchAnalyzeData,
} = require('../_lib/tefas');

describe('TEFAS current API adapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('uses UTC-safe dates and converts them to the current API format', () => {
    expect(formatDate(new Date('2026-07-10T23:30:00Z'))).toBe('10.07.2026');
    expect(toApiDate('10.07.2026')).toBe('20260710');
    expect(buildRequestPayload({
      fontip: 'yat',
      fonkod: 'ak3',
      bastarih: '10.07.2026',
      bittarih: '11.07.2026',
    })).toMatchObject({
      fonTipi: 'YAT',
      fonKodu: 'AK3',
      basTarih: '20260710',
      bitTarih: '20260711',
      basSira: 1,
      bitSira: 9999,
      dil: 'TR',
    });
  });

  test('normalizes current fund history rows into the legacy application contract', () => {
    expect(normalizeInfoRow({
      fonKodu: 'AK3',
      fonUnvan: 'Ak Portföy Hisse Senedi Fonu',
      tarih: '2026-07-10',
      fiyat: 49.97,
      portfoyBuyukluk: 7093883932.28,
      tedPaySayisi: 141949727,
      kisiSayisi: 20984,
    })).toEqual({
      FONKODU: 'AK3',
      FONUNVAN: 'Ak Portföy Hisse Senedi Fonu',
      TARIH: String(Date.parse('2026-07-10T00:00:00Z')),
      FIYAT: 49.97,
      PORTFOYBUYUKLUK: 7093883932.28,
      TEDPAY: 141949727,
      KISISAYISI: 20984,
      BORSABULTENFIYAT: undefined,
    });
  });

  test('normalizes allocation keys including Turkish legacy aliases', () => {
    expect(normalizeAllocationRow({
      fonKodu: 'AK3',
      fonUnvan: 'Ak Portföy',
      tarih: '2026-07-10',
      hs: 91.2,
      dot: 2.4,
      kibd: 1.1,
      rn: 1,
      bilFiyat: '123',
    })).toEqual({
      FONKODU: 'AK3',
      FONUNVAN: 'Ak Portföy',
      TARIH: String(Date.parse('2026-07-10T00:00:00Z')),
      HS: 91.2,
      DÖT: 2.4,
      KİBD: 1.1,
      BilFiyat: '123',
    });
  });

  test('posts JSON to the current info and allocation endpoints', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ resultList: [{ fonKodu: 'AK3', tarih: '2026-07-10', fiyat: 50 }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ resultList: [{ fonKodu: 'AK3', tarih: '2026-07-10', hs: 90 }] }),
      });

    const info = await fetchInfo({ start: '10.07.2026', end: '10.07.2026', code: 'ak3' });
    const allocation = await fetchAllocation({ start: '10.07.2026', end: '10.07.2026', code: 'ak3' });

    expect(global.fetch).toHaveBeenNthCalledWith(1, `${ROOT_URL}${INFO_ENDPOINT}`, expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"fonKodu":"AK3"'),
    }));
    expect(global.fetch).toHaveBeenNthCalledWith(2, `${ROOT_URL}${DETAIL_ENDPOINT}`, expect.objectContaining({
      method: 'POST',
    }));
    expect(info[0]).toMatchObject({ FONKODU: 'AK3', FIYAT: 50 });
    expect(allocation[0]).toMatchObject({ FONKODU: 'AK3', HS: 90 });
  });

  test('treats the TEFAS empty-resultset server error as no rows', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ errorMessage: 'Index 0 out of bounds for length 0' }),
    });

    await expect(fetchInfo({ start: '15.07.2021', end: '15.07.2021' })).resolves.toEqual([]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('adapts the current overview response to the enrichment contract', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        resultList: [{
          fonKodu: 'AK3',
          fonUnvan: 'Ak Portföy',
          fonKategori: 'Hisse Senedi Fonu',
          portBuyukluk: 7175276093,
          yatirimciSayi: 20909,
          pazarPayi: 2.91,
          gunlukGetiri: 1.8254,
        }],
      }),
    });

    const result = await fetchAnalyzeData('ak3');
    expect(result.fundInfo[0]).toMatchObject({
      FONKODU: 'AK3',
      PORTBUYUKLUK: 7175276093,
      YATIRIMCISAYI: 20909,
    });
    expect(result.fundReturn[0].GETIRI1G).toBe(1.8254);
  });
});

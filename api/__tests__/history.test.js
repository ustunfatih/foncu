const fromMock = jest.fn();

jest.mock('../_lib/supabase', () => ({
  from: (...args) => fromMock(...args),
}));

const { fetchFundHistory, fetchFundHistoryBatch } = require('../_lib/history');

function createPagedQuery(pages) {
  return {
    select: jest.fn(function select() { return this; }),
    eq: jest.fn(function eq() { return this; }),
    in: jest.fn(function _in() { return this; }),
    gte: jest.fn(function gte() { return this; }),
    lte: jest.fn(function lte() { return this; }),
    order: jest.fn(function order() { return this; }),
    range: jest.fn((from, to) => Promise.resolve(pages[`${from}:${to}`] || { data: [], error: null })),
  };
}

beforeEach(() => {
  fromMock.mockReset();
});

test('fetchFundHistory paginates beyond the default Supabase row cap', async () => {
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    date: `2026-01-${`${(index % 28) + 1}`.padStart(2, '0')}`,
    price: index + 1,
  }));
  const secondPage = [
    { date: '2026-02-01', price: 1001 },
  ];

  fromMock.mockReturnValue(createPagedQuery({
    '0:999': {
      data: firstPage,
      error: null,
    },
    '1000:1999': {
      data: secondPage,
      error: null,
    },
  }));

  const rows = await fetchFundHistory('aaa', '2026-01-01', '2026-01-31');

  expect(rows).toHaveLength(1001);
  expect(rows.at(-1)).toEqual({ date: '2026-02-01', value: 1001 });
});

test('fetchFundHistoryBatch paginates and groups results by fund code', async () => {
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    fund_code: 'AAA',
    date: `2026-01-${`${(index % 28) + 1}`.padStart(2, '0')}`,
    price: index + 1,
  }));
  fromMock.mockReturnValue(createPagedQuery({
    '0:999': {
      data: firstPage,
      error: null,
    },
    '1000:1999': {
      data: [
        { fund_code: 'BBB', date: '2026-02-01', price: 2001 },
      ],
      error: null,
    },
  }));

  const rows = await fetchFundHistoryBatch(['aaa', 'bbb'], '2026-01-01', '2026-01-31');

  expect(rows.AAA).toHaveLength(1000);
  expect(rows.BBB).toEqual([
    { date: '2026-02-01', value: 2001 },
  ]);
});

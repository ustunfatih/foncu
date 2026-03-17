// We mock the MCP SDK to avoid real network calls in tests
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    callTool: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([{ fon_kodu: 'AKB' }]) }]
    }),
    close: jest.fn().mockResolvedValue(undefined)
  }))
}));

jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: jest.fn()
}));

process.env.FINTABLES_MCP_TOKEN = 'test-token';

const { fintablesQuery } = require('../_lib/fintables');

test('fintablesQuery returns parsed rows', async () => {
  const rows = await fintablesQuery('SELECT fon_kodu FROM fonlar LIMIT 1', 'test');
  expect(rows).toEqual([{ fon_kodu: 'AKB' }]);
});

test('fintablesQuery throws without token', async () => {
  // The token is read inside the function each call, so temporarily unset it
  const original = process.env.FINTABLES_MCP_TOKEN;
  try {
    process.env.FINTABLES_MCP_TOKEN = '';
    await expect(fintablesQuery('SELECT 1', 'test')).rejects.toThrow('FINTABLES_MCP_TOKEN');
  } finally {
    process.env.FINTABLES_MCP_TOKEN = original;
  }
});

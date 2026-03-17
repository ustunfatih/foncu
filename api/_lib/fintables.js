const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const MCP_URL = 'https://evo.fintables.com/mcp';

/**
 * Execute a SQL query against the Fintables EVO database.
 * @param {string} sql - Read-only SELECT or WITH...SELECT statement
 * @param {string} purpose - Short description for logging (e.g. "fetching fund profiles")
 * @returns {Promise<Array<Object>>} Array of row objects
 */
async function fintablesQuery(sql, purpose) {
  const MCP_TOKEN = process.env.FINTABLES_MCP_TOKEN;
  if (!MCP_TOKEN) {
    throw new Error('FINTABLES_MCP_TOKEN environment variable is not set');
  }

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: {
      headers: { Authorization: `Bearer ${MCP_TOKEN}` }
    }
  });

  const client = new Client({ name: 'foncu-sync', version: '1.0.0' });

  try {
    await client.connect(transport);

    const result = await client.callTool('veri_sorgula', { sql, purpose });

    // The MCP tool returns content as an array of text blocks
    const textContent = result.content?.find(c => c.type === 'text');
    if (!textContent) {
      throw new Error(`No text content returned from Fintables for: ${purpose}`);
    }

    const parsed = JSON.parse(textContent.text);
    // Fintables returns { rows: [...] } or directly an array
    return Array.isArray(parsed) ? parsed : (parsed.rows ?? parsed.data ?? []);
  } finally {
    await client.close();
  }
}

module.exports = { fintablesQuery };

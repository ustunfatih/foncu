const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const MCP_URL = 'https://evo.fintables.com/mcp';
const PAGE_SIZE = 300;

/**
 * Parse a markdown table string into an array of row objects.
 * Handles the format: | col1 | col2 | ... | with a --- separator row.
 */
function parseMarkdownTable(tableStr) {
  const lines = tableStr.split('\n').filter(l => l.trim());
  if (lines.length < 3) return []; // need header + separator + at least one data row

  // Extract headers from first line
  const headers = lines[0].split('|').map(h => h.trim()).filter(Boolean);
  // Skip separator (line 1), parse data rows (line 2+)
  const rows = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i].split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < headers.length) continue;
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const val = cells[j];
      // Auto-convert numeric values
      const num = Number(val);
      row[headers[j]] = val !== '' && !Number.isNaN(num) ? num : val;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Execute a SQL query against the Fintables EVO database.
 * @param {string} sql - Read-only SELECT or WITH...SELECT statement
 * @param {string} purpose - Short description for logging
 * @param {string} [token] - Optional token override (uses env var if not provided)
 * @returns {Promise<Array<Object>>} Array of row objects
 */
async function fintablesQuery(sql, purpose, token) {
  const MCP_TOKEN = token || process.env.FINTABLES_MCP_TOKEN;
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

    const textContent = result.content?.find(c => c.type === 'text');
    if (!textContent) {
      throw new Error(`No text content returned from Fintables for: ${purpose}`);
    }

    const parsed = JSON.parse(textContent.text);

    // Handle multiple response formats from Fintables MCP:
    // 1. Direct array of rows
    if (Array.isArray(parsed)) return parsed;
    // 2. Object with rows/data array
    if (Array.isArray(parsed.rows)) return parsed.rows;
    if (Array.isArray(parsed.data)) return parsed.data;
    // 3. Object with markdown table string (most common from Fintables MCP)
    if (parsed.table && typeof parsed.table === 'string') {
      return parseMarkdownTable(parsed.table);
    }

    return [];
  } finally {
    await client.close();
  }
}

/**
 * Execute a paginated SQL query, fetching all rows past the 300-row MCP limit.
 * The provided SQL must NOT contain its own LIMIT/OFFSET clauses.
 * @param {string} baseSql - SQL without LIMIT/OFFSET
 * @param {string} purpose - Short description for logging
 * @param {string} [token] - Optional token override
 * @returns {Promise<Array<Object>>} All rows combined
 */
async function fintablesQueryAll(baseSql, purpose, token) {
  const allRows = [];
  let offset = 0;

  while (true) {
    const sql = `${baseSql}\nLIMIT ${PAGE_SIZE} OFFSET ${offset}`;
    const rows = await fintablesQuery(sql, `${purpose} (offset ${offset})`, token);
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break; // last page
    offset += PAGE_SIZE;
  }

  return allRows;
}

module.exports = { fintablesQuery, fintablesQueryAll, parseMarkdownTable };

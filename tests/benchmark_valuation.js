const assert = require('node:assert/strict');
const Module = require('module');

// Statistics
let queryCount = 0;

// Mock Supabase Client
const mockSupabase = {
  from: (table) => {
    return {
      select: (columns) => {
        return {
          eq: (col, val) => {
            return {
              order: (col, opts) => {
                return {
                  limit: (n) => {
                    return {
                      maybeSingle: async () => {
                        queryCount++;
                        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate 50ms DB latency
                        // Return mock data
                        return {
                          data: { date: '2023-10-27', price: 123.45 },
                          error: null
                        };
                      }
                    };
                  }
                };
              },
              gte: (col, date) => { // Needed if fetchFundHistory used eq first? No, fetchFundHistory uses select().eq().gte()
                 return {
                   lte: () => ({
                     order: () => ({
                        then: async (resolve, reject) => {
                          queryCount++;
                           await new Promise(r => setTimeout(r, 50));
                           resolve({ data: [], error: null });
                        }
                     })
                   })
                 }
              }
            };
          },
          in: (col, values) => {
             return {
               gte: (col, val) => {
                 return {
                   order: (col, opts) => {
                     // This handles the batch query chain
                     return {
                       then: async (resolve, reject) => {
                         queryCount++;
                         await new Promise(r => setTimeout(r, 50)); // Simulate 50ms DB latency
                         // Return mock data for batch
                         // Return 1 row per requested code
                         const data = values.map(code => ({
                           fund_code: code,
                           date: '2023-10-27',
                           price: 123.45
                         }));
                         resolve({ data, error: null });
                       }
                     };
                   }
                 };
               }
             };
          }
        };
      }
    };
  }
};

// Mock dependencies
const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
  if (path === '@supabase/supabase-js') {
    return {
      createClient: () => mockSupabase
    };
  }
  if (path === 'dotenv') {
    return {
      config: () => ({})
    };
  }
  return originalRequire.apply(this, arguments);
};

// Set environment variables for the handler
process.env.SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';

// Import the handler (it uses the mocked modules)
const handler = require('../api/portfolio-valuation');

async function runBenchmark() {
  console.log('Running benchmark...');

  // Create a large payload
  const holdings = [];
  for (let i = 0; i < 20; i++) {
    holdings.push({
      code: `FUND${i}`,
      shares: 100,
      cost: 10
    });
  }

  const req = {
    method: 'POST',
    body: { holdings }
  };

  const res = {
    statusCode: 0,
    body: null,
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.body = data;
      return this;
    }
  };

  queryCount = 0;
  const start = performance.now();

  await handler(req, res);

  const end = performance.now();
  const duration = end - start;

  console.log('---------------------------------------------------');
  console.log(`Duration: ${duration.toFixed(2)} ms`);
  console.log(`Queries executed: ${queryCount}`);
  console.log('---------------------------------------------------');

  if (res.statusCode !== 200) {
    console.error('Handler failed:', res.body);
    process.exit(1);
  }
}

runBenchmark();

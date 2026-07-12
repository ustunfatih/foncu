const fs = require('fs');
const path = require('path');
require('dotenv').config();

const root = path.resolve(__dirname, '..');
const production = process.argv.includes('--production');
const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET'];
const browserRequired = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
const missing = [...required, ...browserRequired].filter((key) => !process.env[key]);
const weakSecret = process.env.CRON_SECRET && process.env.CRON_SECRET.length < 16;
const migrationDir = path.join(root, 'supabase', 'migrations');
const migrations = fs.readdirSync(migrationDir).filter((file) => file.endsWith('.sql')).sort();
const hasCanonicalPortfolioMigration = migrations.some((file) => file.includes('portfolio_holdings_security'));

const report = {
  mode: production ? 'production' : 'local',
  environment: {
    configured: [...required, ...browserRequired].filter((key) => process.env[key]),
    missing,
    cronSecretLengthValid: !weakSecret,
  },
  migrations: { count: migrations.length, latest: migrations.at(-1), hasCanonicalPortfolioMigration },
  endpoints: ['/api/health', '/api/funds?kind=YAT'],
};

console.log(JSON.stringify(report, null, 2));
if (production && (missing.length || weakSecret || !hasCanonicalPortfolioMigration)) process.exitCode = 1;

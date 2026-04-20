const express = require('express');
const path = require('path');

// Set up env variables if needed
require('dotenv').config();

const API_ROOT = path.resolve(__dirname, 'api');

const ROUTE_MODULES = {
  'fund-history': './api/fund-history',
  'fund-profile': './api/fund-profile',
  'fund-risk': './api/fund-risk',
  'fund-screen': './api/fund-screen',
  'fund-technical-scan': './api/fund-technical-scan',
  funds: './api/funds',
  'holdings-screener': './api/holdings-screener',
  'macro-series': './api/macro-series',
  'market-events': './api/market-events',
  overlap: './api/overlap',
  portfolio: './api/portfolio',
  'sync-fintables': './api/sync-fintables'
};

function resolveApiRoute(rawRoute) {
  const incomingRoute = rawRoute || '/';
  const normalizedRoute = path.posix.normalize(incomingRoute);

  const incomingRouteName = incomingRoute.replace(/^\/+/, '');
  const routeName = normalizedRoute.replace(/^\/+/, '');

  if (
    incomingRouteName.includes('..') ||
    incomingRouteName.startsWith('.') ||
    routeName.includes('..') ||
    routeName.startsWith('.') ||
    routeName.includes('/') ||
    routeName.includes('\\')
  ) {
    return { error: 400, message: 'Malformed API route.' };
  }

  if (!routeName) {
    return { error: 404, message: 'API route not found' };
  }

  const moduleRef = ROUTE_MODULES[routeName];
  if (!moduleRef) {
    return { error: 404, message: 'API route not found' };
  }

  const resolvedPath = path.resolve(__dirname, moduleRef + '.js');
  const isInsideApiRoot =
    resolvedPath === API_ROOT || resolvedPath.startsWith(`${API_ROOT}${path.sep}`);

  if (!isInsideApiRoot) {
    return { error: 400, message: 'Malformed API route.' };
  }

  return {
    routeName,
    handler: require(moduleRef)
  };
}

function createApp() {
  const app = express();
  app.use(express.json());

  // Static allowlisted loader for Vercel-like functions
  app.use('/api', async (req, res) => {
    const routeResult = resolveApiRoute(req.path);

    if (routeResult.error) {
      return res.status(routeResult.error).json({ error: routeResult.message });
    }

    try {
      await routeResult.handler(req, res);
    } catch (err) {
      console.error('Error running API handler:', err);
      return res.status(500).json({ error: 'Internal server error from local proxy.' });
    }
  });

  return app;
}

if (require.main === module) {
  const PORT = 3000;
  createApp().listen(PORT, () => {
    console.log(`Fallback Local API Server listening on http://localhost:${PORT}`);
  });
}

module.exports = { createApp, resolveApiRoute, ROUTE_MODULES, API_ROOT };

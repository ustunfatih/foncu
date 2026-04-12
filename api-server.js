const express = require('express');
const path = require('path');

// Set up env variables if needed
require('dotenv').config();

// Dynamic loader for Vercel functions
app.use('/api', async (req, res) => {
  // req.path will be like "/overlap" or "/fund-profile" since it's mounted on /api
  const fileRoute = req.path.replace(/^\//, ''); 
  const apiDir = path.join(__dirname, 'api');
  const jsPath = path.resolve(apiDir, fileRoute + '.js');

  // Security check: Ensure the resolved path is still inside the api directory
  const relative = path.relative(apiDir, jsPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return res.status(403).json({ error: 'Access denied' });
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

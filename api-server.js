const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

// Set up env variables if needed
require('dotenv').config();

// Dynamic loader for Vercel functions
app.use('/api', async (req, res) => {
  // req.path will be like "/overlap" or "/fund-profile" since it's mounted on /api
  const fileRoute = req.path.replace(/^\//, ''); 
  const jsPath = path.join(__dirname, 'api', fileRoute + '.js');

  if (fs.existsSync(jsPath)) {
    try {
      const handler = require(jsPath);
      // Express mounted on /api keeps req.query populated
      await handler(req, res);
    } catch (err) {
      console.error('Error running API handler:', err);
      res.status(500).json({ error: 'Internal server error from local proxy.' });
    }
  } else {
    res.status(404).json({ error: 'API route not found' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Fallback Local API Server listening on http://localhost:${PORT}`);
});

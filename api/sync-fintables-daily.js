const syncFintables = require('./sync-fintables');

module.exports = async (req, res) => syncFintables({
  ...req,
  query: {
    ...req.query,
    phase: 'daily',
  },
}, res);

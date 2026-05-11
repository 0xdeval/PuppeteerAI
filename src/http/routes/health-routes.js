'use strict';

function registerHealthRoutes(app) {
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
}

module.exports = {
  registerHealthRoutes,
};

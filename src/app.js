'use strict';

const express = require('express');
const path = require('path');

const { createRequireAuth, createRequireAuthOrQuery } = require('./http/middleware/auth');
const { createTimeoutMiddleware } = require('./http/middleware/timeout');
const { registerRoutes } = require('./http/routes');
const { automationService: defaultAutomationService } = require('./services/automation-service');
const { profileService: defaultProfileService } = require('./services/profile-service');

function createApp(options = {}) {
  const apiSecret = options.apiSecret ?? process.env.API_SECRET;
  const authDisabled = options.authDisabled
    ?? /^(1|true|yes)$/i.test(process.env.DISABLE_API_AUTH || '');
  const httpTimeoutMs = options.httpTimeoutMs
    ?? (parseInt(process.env.MAX_BROWSER_TIMEOUT || '600', 10) * 1000);
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const automationService = options.automationService || defaultAutomationService;
  const profileService = options.profileService || defaultProfileService;

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(createTimeoutMiddleware(httpTimeoutMs));

  const requireAuth = createRequireAuth(apiSecret, { authDisabled });
  const requireAuthOrQuery = createRequireAuthOrQuery(apiSecret, { authDisabled });

  registerRoutes(app, {
    requireAuth,
    requireAuthOrQuery,
    dataDir,
    automationService,
    profileService,
  });

  app.use((err, req, res, next) => {
    console.error('[server] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

module.exports = {
  createApp,
};

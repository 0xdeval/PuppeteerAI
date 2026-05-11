'use strict';

const express = require('express');
const { createDebugHandlers } = require('../handlers/debug-handlers');

function registerDebugRoutes(app, options) {
  const router = express.Router();
  const handlers = createDebugHandlers({ dataDir: options.dataDir });

  router.get('/debug', options.requireAuthOrQuery, handlers.listDebugFiles);
  router.get('/debug/:filename', options.requireAuthOrQuery, handlers.getDebugFile);

  app.use(router);
}

module.exports = {
  registerDebugRoutes,
};

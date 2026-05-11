'use strict';

const express = require('express');
const { createAutomationHandlers } = require('../handlers/automation-handlers');

function registerAutomationRoutes(app, options) {
  const router = express.Router();
  const handlers = createAutomationHandlers({
    automationService: options.automationService,
  });

  router.post('/post', options.requireAuth, handlers.post);
  router.post('/reply', options.requireAuth, handlers.reply);
  router.post('/scrape', options.requireAuth, handlers.scrape);

  app.use(router);
}

module.exports = {
  registerAutomationRoutes,
};

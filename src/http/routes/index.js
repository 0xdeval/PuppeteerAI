'use strict';

const { registerHealthRoutes } = require('./health-routes');
const { registerProfileRoutes } = require('./profile-routes');
const { registerAutomationRoutes } = require('./automation-routes');
const { registerDebugRoutes } = require('./debug-routes');

function registerRoutes(app, options) {
  registerHealthRoutes(app);
  registerProfileRoutes(app, options);
  registerAutomationRoutes(app, options);
  registerDebugRoutes(app, options);
}

module.exports = {
  registerRoutes,
};

'use strict';

const express = require('express');
const { createProfileHandlers } = require('../handlers/profile-handlers');

function registerProfileRoutes(app, options) {
  const router = express.Router();
  const handlers = createProfileHandlers({ profileService: options.profileService });

  router.get('/profiles', options.requireAuth, handlers.listProfiles);
  router.delete('/profiles/:profileId', options.requireAuth, handlers.deleteProfileById);
  router.post('/profiles/:profileId/cookies', options.requireAuth, handlers.importCookies);
  router.get('/profiles/:profileId/cookies', options.requireAuth, handlers.getCookies);

  app.use(router);
}

module.exports = {
  registerProfileRoutes,
};

'use strict';

function createRequireAuth(apiSecret, options = {}) {
  const authDisabled = options.authDisabled === true;

  return function requireAuth(req, res, next) {
    if (authDisabled) {
      return next();
    }

    if (!apiSecret) {
      return res.status(500).json({ error: 'API_SECRET not configured on server.' });
    }

    const key = req.headers['x-api-key'];
    if (!key || key !== apiSecret) {
      return res.status(401).json({ error: 'Unauthorized. Provide a valid x-api-key header.' });
    }

    next();
  };
}

function createRequireAuthOrQuery(apiSecret, options = {}) {
  const authDisabled = options.authDisabled === true;

  return function requireAuthOrQuery(req, res, next) {
    if (authDisabled) {
      return next();
    }

    if (!apiSecret) {
      return res.status(500).json({ error: 'API_SECRET not configured on server.' });
    }

    const key = req.headers['x-api-key'] || req.query.key;
    if (!key || key !== apiSecret) {
      return res.status(401).json({
        error: 'Unauthorized. Provide a valid x-api-key header or ?key= query param.',
      });
    }

    next();
  };
}

module.exports = {
  createRequireAuth,
  createRequireAuthOrQuery,
};

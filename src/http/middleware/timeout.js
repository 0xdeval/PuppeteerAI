'use strict';

function createTimeoutMiddleware(timeoutMs) {
  return function timeoutMiddleware(req, res, next) {
    res.setTimeout(timeoutMs);
    next();
  };
}

module.exports = {
  createTimeoutMiddleware,
};

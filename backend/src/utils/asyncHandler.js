/**
 * Async Handler Utility
 *
 * Wraps async Express handlers so rejected promises flow to the centralized
 * error middleware instead of requiring repeated try/catch blocks.
 */

/**
 * Wrap an async route or middleware function.
 *
 * @param {Function} handler Express handler that may return a promise.
 * @returns {Function} Express-compatible middleware.
 * @sideeffects Forwards thrown/rejected errors to next().
 */
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };

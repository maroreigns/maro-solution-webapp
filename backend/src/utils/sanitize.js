/**
 * Sanitization Utilities
 *
 * Provides lightweight text cleanup for request bodies before validation and
 * persistence. This complements express-mongo-sanitize in app middleware.
 */

/**
 * Remove simple HTML tags, control characters, and repeated whitespace.
 *
 * @param {*} value Value to sanitize.
 * @returns {*} Sanitized string, or the original non-string value.
 * @sideeffects None.
 */
function sanitizeString(value) {
  if (typeof value !== 'string') {
    return value;
  }

  return value
    .replace(/<[^>]*>?/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Recursively sanitize arrays and object values.
 *
 * @param {*} input Value, array, or object to sanitize.
 * @returns {*} Sanitized clone for arrays/objects, or sanitized scalar value.
 * @sideeffects None.
 */
function sanitizeObject(input) {
  if (Array.isArray(input)) {
    return input.map(sanitizeObject);
  }

  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, sanitizeObject(value)])
    );
  }

  return sanitizeString(input);
}

/**
 * Express middleware that sanitizes req.body in place before validation.
 *
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 * @returns {void}
 * @sideeffects Replaces req.body with sanitized values.
 */
function sanitizeRequestBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  next();
}

module.exports = {
  sanitizeObject,
  sanitizeRequestBody,
  sanitizeString,
};

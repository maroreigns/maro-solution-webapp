/**
 * Owner Authentication Middleware
 *
 * Verifies business owner JWT bearer tokens and attaches the owner's Business
 * document to req.ownerBusiness for profile and photo updates.
 */
const jwt = require('jsonwebtoken');
const { Business } = require('../models/Business');
const { asyncHandler } = require('../utils/asyncHandler');

/**
 * Resolve the signing secret used for owner JWTs.
 *
 * @returns {string} Owner-specific secret, admin JWT fallback, or empty string.
 * @sideeffects None.
 */
function getOwnerJwtSecret() {
  return process.env.OWNER_JWT_SECRET || process.env.JWT_SECRET || '';
}

/**
 * Require a valid business owner bearer token.
 *
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 * @returns {Promise<void>}
 * @sideeffects Reads Authorization header and assigns req.ownerBusiness.
 */
const requireOwnerAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.get('authorization') || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      message: 'Owner authentication required.',
    });
  }

  const secret = getOwnerJwtSecret();
  if (!secret) {
    return res.status(500).json({
      success: false,
      message: 'Owner authentication is not configured.',
    });
  }

  try {
    const decoded = jwt.verify(token, secret);
    const business = await Business.findById(decoded.sub);

    if (!business || decoded.role !== 'business-owner') {
      return res.status(401).json({
        success: false,
        message: 'Owner authentication required.',
      });
    }

    req.ownerBusiness = business;
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Owner authentication required.',
    });
  }
});

module.exports = {
  getOwnerJwtSecret,
  requireOwnerAuth,
};

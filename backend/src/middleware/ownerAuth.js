/**
 * Owner Authentication Middleware
 *
 * Verifies business owner JWT bearer tokens and attaches the owner's Business
 * document to req.ownerBusiness for profile and photo updates.
 */
const jwt = require('jsonwebtoken');
const { Business } = require('../models/Business');
const { Owner } = require('../models/Owner');
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
    let business = null;
    let owner = null;

    if (decoded.role === 'business-owner') {
      business = await Business.findById(decoded.sub);
      const ownerId = decoded.ownerId || (business && business.ownerId);
      owner = ownerId ? await Owner.findById(ownerId) : null;
    } else if (decoded.role === 'owner-account') {
      owner = await Owner.findById(decoded.sub);
      business = owner && owner.businessId
        ? await Business.findById(owner.businessId)
        : owner ? await Business.findOne({ ownerId: owner._id }) : null;
    }

    if (!business) {
      return res.status(401).json({
        success: false,
        message: 'Owner authentication required.',
      });
    }

    req.ownerAccount = owner;
    req.ownerBusiness = business;
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Owner authentication required.',
    });
  }
});

const optionalOwnerAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.get('authorization') || '';
  if (!authHeader) return next();
  const [scheme, token] = authHeader.split(' ');
  const secret = getOwnerJwtSecret();
  if (scheme !== 'Bearer' || !token || !secret) {
    return res.status(401).json({ success: false, message: 'Owner authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, secret);
    if (decoded.role === 'owner-account') {
      req.ownerAccount = await Owner.findById(decoded.sub);
    } else if (decoded.role === 'business-owner') {
      req.ownerBusiness = await Business.findById(decoded.sub);
      const ownerId = decoded.ownerId || (req.ownerBusiness && req.ownerBusiness.ownerId);
      req.ownerAccount = ownerId ? await Owner.findById(ownerId) : null;
    }
    if (!req.ownerAccount && !req.ownerBusiness) {
      return res.status(401).json({ success: false, message: 'Owner authentication required.' });
    }
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Owner authentication required.' });
  }
});

module.exports = {
  getOwnerJwtSecret,
  optionalOwnerAuth,
  requireOwnerAuth,
};

/**
 * Admin Authentication Middleware
 *
 * Verifies admin JWT bearer tokens and attaches the authenticated admin record
 * to req.admin for protected dashboard actions.
 */
const jwt = require('jsonwebtoken');
const { Admin } = require('../models/Admin');
const { asyncHandler } = require('../utils/asyncHandler');

/**
 * Require a valid admin bearer token.
 *
 * @param {Request} req
 * @param {Response} res
 * @param {Function} next
 * @returns {Promise<void>}
 * @sideeffects Reads Authorization header and assigns req.admin on success.
 */
const requireAdminAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.get('authorization') || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      success: false,
      message: 'Admin authentication required.',
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      success: false,
      message: 'Admin authentication is not configured.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.sub).select('_id email role');

    if (!admin || admin.role !== 'admin') {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required.',
      });
    }

    req.admin = admin;
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Admin authentication required.',
    });
  }
});

module.exports = { requireAdminAuth };

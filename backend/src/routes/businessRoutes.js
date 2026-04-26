const express = require('express');
const {
  createBusiness,
  deleteBusiness,
  getBusinessById,
  getBusinesses,
  rateBusiness,
  updateBusiness,
} = require('../controllers/businessController');
const { upload } = require('../middleware/upload');
const {
  businessValidationRules,
  handleValidationResult,
} = require('../middleware/validateBusiness');
const { sanitizeRequestBody } = require('../utils/sanitize');

const router = express.Router();
const rateLimit = require('express-rate-limit');

const formSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many business submissions from this IP. Please try again later.',
  },
});

const ratingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many rating attempts from this IP. Please try again later.',
  },
});

const adminDeleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many delete attempts from this IP. Please try again later.',
  },
});

function requireAdminDeleteToken(req, res, next) {
  const configuredToken = process.env.ADMIN_DELETE_TOKEN;
  const providedToken = req.get('x-admin-token');

  if (!configuredToken) {
    return res.status(500).json({
      success: false,
      message: 'ADMIN_DELETE_TOKEN is not configured on the server.',
    });
  }

  if (!providedToken || providedToken !== configuredToken) {
    return res.status(403).json({
      success: false,
      message: 'Invalid admin token.',
    });
  }

  return next();
}

router
  .route('/')
  .get(getBusinesses)
  .post(
    formSubmissionLimiter,
    upload.single('profileImage'),
    sanitizeRequestBody,
    businessValidationRules,
    handleValidationResult,
    createBusiness
  );

router.post('/:id/rate', ratingLimiter, sanitizeRequestBody, rateBusiness);

router
  .route('/:id')
  .get(getBusinessById)
  .put(
    formSubmissionLimiter,
    upload.single('profileImage'),
    sanitizeRequestBody,
    businessValidationRules,
    handleValidationResult,
    updateBusiness
  )
  .delete(adminDeleteLimiter, requireAdminDeleteToken, deleteBusiness);

module.exports = { businessRoutes: router };

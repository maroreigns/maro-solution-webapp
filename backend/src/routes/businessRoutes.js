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
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many business submissions from this IP. Please try again later.',
  },
});

function requireAdminDeleteToken(req, res, next) {
  const configuredToken = process.env.ADMIN_DELETE_TOKEN;
  const providedToken = req.get('x-admin-token');

  if (!providedToken) {
    return res.status(401).json({
      success: false,
      message: 'Admin token is required.',
    });
  }

  if (!configuredToken || providedToken !== configuredToken) {
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

router.post('/:id/rate', sanitizeRequestBody, rateBusiness);

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
  .delete(requireAdminDeleteToken, deleteBusiness);

module.exports = { businessRoutes: router };

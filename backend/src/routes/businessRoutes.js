const express = require('express');
const {
  approveBusiness,
  createBusiness,
  deleteBusiness,
  getBusinessById,
  getBusinesses,
  getPendingBusinesses,
  rateBusiness,
  rejectBusiness,
  rejectPayment,
  updateBusiness,
  verifyPayment,
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

function requireAdminToken(req, res, next) {
  const configuredToken = process.env.ADMIN_TOKEN || process.env.ADMIN_DELETE_TOKEN;
  const token = req.headers['x-admin-token'];

  if (!configuredToken) {
    return res.status(500).json({
      success: false,
      message: 'Admin token is not configured.',
    });
  }

  if (token === configuredToken) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Admin access denied.',
  });
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

router.get('/admin/pending', requireAdminToken, getPendingBusinesses);

router.patch('/:id/verify-payment', requireAdminToken, verifyPayment);
router.patch('/:id/reject-payment', requireAdminToken, rejectPayment);
router.patch('/:id/approve', requireAdminToken, approveBusiness);
router.patch('/:id/reject', requireAdminToken, rejectBusiness);

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
  .delete(adminDeleteLimiter, requireAdminToken, deleteBusiness);

module.exports = { businessRoutes: router };

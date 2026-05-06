const express = require('express');
const {
  addBusinessComment,
  approveBusiness,
  createBusiness,
  deleteBusiness,
  deleteBusinessReport,
  getBusinessById,
  getBusinessOwnerStatus,
  getBusinessReports,
  getBusinesses,
  getPendingBusinesses,
  rateBusiness,
  reportBusiness,
  resolveBusinessReport,
  rejectBusiness,
  rejectPayment,
  updateBusiness,
  verifyBusinessPhone,
  verifyPayment,
} = require('../controllers/businessController');
const { upload } = require('../middleware/upload');
const {
  businessValidationRules,
  handleValidationResult,
} = require('../middleware/validateBusiness');
const { requireAdminAuth } = require('../middleware/adminAuth');
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

router
  .route('/')
  .get(getBusinesses)
  .post(
    formSubmissionLimiter,
    upload.fields([
      { name: 'profileImage', maxCount: 1 },
      { name: 'serviceImages', maxCount: 3 },
    ]),
    sanitizeRequestBody,
    businessValidationRules,
    handleValidationResult,
    createBusiness
  );

router.get('/admin/reports', requireAdminAuth, getBusinessReports);
router.patch('/admin/reports/:id/resolve', requireAdminAuth, resolveBusinessReport);
router.delete('/admin/reports/:id', adminDeleteLimiter, requireAdminAuth, deleteBusinessReport);
router.get('/admin/pending', requireAdminAuth, getPendingBusinesses);

router.post('/:id/rate', ratingLimiter, sanitizeRequestBody, rateBusiness);
router.post('/:id/comments', sanitizeRequestBody, addBusinessComment);
router.post('/:id/report', sanitizeRequestBody, reportBusiness);
router.get('/:id/owner-status', getBusinessOwnerStatus);

router.patch('/:id/verify-payment', requireAdminAuth, verifyPayment);
router.patch('/:id/verify-phone', requireAdminAuth, verifyBusinessPhone);
router.patch('/:id/reject-payment', requireAdminAuth, rejectPayment);
router.patch('/:id/approve', requireAdminAuth, approveBusiness);
router.patch('/:id/reject', requireAdminAuth, rejectBusiness);

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
  .delete(adminDeleteLimiter, requireAdminAuth, deleteBusiness);

module.exports = { businessRoutes: router };

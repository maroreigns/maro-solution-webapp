const express = require('express');
const {
  addBusinessComment,
  approveBusiness,
  createBusiness,
  deleteBusiness,
  deleteBusinessReport,
  forgotOwnerPassword,
  getBusinessById,
  getBusinessOwnerStatus,
  getBusinessReports,
  getBusinesses,
  getPendingBusinesses,
  getOwnerMe,
  loginBusinessOwner,
  rateBusiness,
  reportBusiness,
  resolveBusinessReport,
  rejectBusiness,
  rejectPayment,
  resetOwnerPassword,
  updateBusiness,
  updateOwnerPhotos,
  updateOwnerProfile,
  verifyBusinessPhone,
  verifyPayment,
} = require('../controllers/businessController');
const { upload } = require('../middleware/upload');
const {
  businessValidationRules,
  handleValidationResult,
} = require('../middleware/validateBusiness');
const { requireAdminAuth } = require('../middleware/adminAuth');
const { requireOwnerAuth } = require('../middleware/ownerAuth');
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

router.post('/owner/login', sanitizeRequestBody, loginBusinessOwner);
router.post('/owner/forgot-password', sanitizeRequestBody, forgotOwnerPassword);
router.post('/owner/reset-password', sanitizeRequestBody, resetOwnerPassword);
router.get('/owner/me', requireOwnerAuth, getOwnerMe);
router.put(
  '/owner/profile',
  requireOwnerAuth,
  sanitizeRequestBody,
  businessValidationRules,
  handleValidationResult,
  updateOwnerProfile
);
router.patch(
  '/owner/photos',
  requireOwnerAuth,
  upload.fields([
    { name: 'profileImage', maxCount: 1 },
    { name: 'serviceImages', maxCount: 3 },
  ]),
  updateOwnerPhotos
);

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

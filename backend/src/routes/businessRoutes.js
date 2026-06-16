/**
 * Business Routes
 *
 * Mount path: /api/businesses
 * Connects public listing, owner dashboard, admin review, ratings, comments,
 * reports, uploads, and payment status endpoints.
 */
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

// GET /api/businesses
// List approved and paid businesses, with optional search filters.
//
// POST /api/businesses
// Create a new business listing with optional profile/service images.
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

// GET /api/businesses/admin/reports
// Load pending trust reports for admin review.
router.get('/admin/reports', requireAdminAuth, getBusinessReports);

// PATCH /api/businesses/admin/reports/:id/resolve
// Mark a submitted business report as resolved.
router.patch('/admin/reports/:id/resolve', requireAdminAuth, resolveBusinessReport);

// DELETE /api/businesses/admin/reports/:id
// Delete a submitted business report from the admin queue.
router.delete('/admin/reports/:id', adminDeleteLimiter, requireAdminAuth, deleteBusinessReport);

// GET /api/businesses/admin/pending
// Load businesses awaiting payment verification or admin approval.
router.get('/admin/pending', requireAdminAuth, getPendingBusinesses);

// POST /api/businesses/owner/login
// Authenticate a business owner by email or phone.
router.post('/owner/login', sanitizeRequestBody, loginBusinessOwner);

// POST /api/businesses/owner/forgot-password
// Send an owner password reset email when the account exists.
router.post('/owner/forgot-password', sanitizeRequestBody, forgotOwnerPassword);

// POST /api/businesses/owner/reset-password
// Complete owner password reset with a valid reset token.
router.post('/owner/reset-password', sanitizeRequestBody, resetOwnerPassword);

// GET /api/businesses/owner/me
// Return the authenticated owner listing for the dashboard.
router.get('/owner/me', requireOwnerAuth, getOwnerMe);

// PUT /api/businesses/owner/profile
// Update owner-managed business details, including optional map coordinates.
router.put(
  '/owner/profile',
  requireOwnerAuth,
  sanitizeRequestBody,
  businessValidationRules,
  handleValidationResult,
  updateOwnerProfile
);

// PATCH /api/businesses/owner/photos
// Update owner-managed profile and service photos.
router.patch(
  '/owner/photos',
  requireOwnerAuth,
  upload.fields([
    { name: 'profileImage', maxCount: 1 },
    { name: 'serviceImages', maxCount: 3 },
  ]),
  updateOwnerPhotos
);

// POST /api/businesses/:id/rate
// Add a visitor rating to an approved business.
router.post('/:id/rate', ratingLimiter, sanitizeRequestBody, rateBusiness);

// POST /api/businesses/:id/comments
// Add a visitor comment to an approved business profile.
router.post('/:id/comments', sanitizeRequestBody, addBusinessComment);

// POST /api/businesses/:id/report
// Submit a visitor report about a business listing.
router.post('/:id/report', sanitizeRequestBody, reportBusiness);

// GET /api/businesses/:id/owner-status
// Return listing/payment status for owner post-payment tracking.
router.get('/:id/owner-status', getBusinessOwnerStatus);

// PATCH /api/businesses/:id/verify-payment
// Admin action to verify payment through saved Paystack reference.
router.patch('/:id/verify-payment', requireAdminAuth, verifyPayment);

// PATCH /api/businesses/:id/verify-phone
// Admin action to mark a business phone number as verified.
router.patch('/:id/verify-phone', requireAdminAuth, verifyBusinessPhone);

// PATCH /api/businesses/:id/reject-payment
// Admin action to reject payment and mark the listing rejected.
router.patch('/:id/reject-payment', requireAdminAuth, rejectPayment);

// PATCH /api/businesses/:id/approve
// Admin action to approve a paid listing for public display.
router.patch('/:id/approve', requireAdminAuth, approveBusiness);

// PATCH /api/businesses/:id/reject
// Admin action to reject a listing after review.
router.patch('/:id/reject', requireAdminAuth, rejectBusiness);

// GET /api/businesses/:id
// Load one approved and paid business profile.
//
// PUT /api/businesses/:id
// Admin-compatible update path for business details and profile image.
//
// DELETE /api/businesses/:id
// Admin action to remove a business and its reports.
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

/**
 * Admin Routes
 *
 * Mount path: /api/admin
 * Provides admin session endpoints for the admin dashboard.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { getAdminMe, loginAdmin } = require('../controllers/adminController');
const { requireAdminAuth } = require('../middleware/adminAuth');
const { sanitizeRequestBody } = require('../utils/sanitize');

const router = express.Router();

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again later.',
  },
});

// POST /api/admin/login
// Authenticate an admin and return a dashboard JWT.
router.post('/login', adminLoginLimiter, sanitizeRequestBody, loginAdmin);

// GET /api/admin/me
// Return the authenticated admin profile for session checks.
router.get('/me', requireAdminAuth, getAdminMe);

module.exports = { adminRoutes: router };

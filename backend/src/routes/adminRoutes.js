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

router.post('/login', adminLoginLimiter, sanitizeRequestBody, loginAdmin);
router.get('/me', requireAdminAuth, getAdminMe);

module.exports = { adminRoutes: router };
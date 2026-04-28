const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  initializePayment,
  verifyPaystackReference,
} = require('../controllers/paymentController');
const { sanitizeRequestBody } = require('../utils/sanitize');

const router = express.Router();

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many payment attempts. Please try again later.',
  },
});

router.post(
  '/initialize/:businessId',
  paymentLimiter,
  sanitizeRequestBody,
  initializePayment
);

router.post('/verify', paymentLimiter, sanitizeRequestBody, verifyPaystackReference);

module.exports = { paymentRoutes: router };

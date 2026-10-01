const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireOwnerAuth } = require('../middleware/ownerAuth');
const { requireAdminAuth } = require('../middleware/adminAuth');
const { sanitizeRequestBody } = require('../utils/sanitize');
const controller = require('../controllers/promotionController');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
router.get('/plans', controller.getPromotionPlans);
router.get('/owner', requireOwnerAuth, controller.getOwnerPromotions);
router.post('/initialize', limiter, requireOwnerAuth, sanitizeRequestBody, controller.initializePromotion);
router.post('/verify', limiter, requireOwnerAuth, sanitizeRequestBody, controller.verifyPromotion);
router.get('/admin', requireAdminAuth, controller.getAdminPromotions);
router.patch('/admin/:id/approve', requireAdminAuth, controller.approvePromotion);
router.patch('/admin/:id/reject', requireAdminAuth, controller.rejectPromotion);
router.patch('/admin/:id/cancel', requireAdminAuth, controller.cancelPromotion);
module.exports = { promotionRoutes: router };

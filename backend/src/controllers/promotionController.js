const crypto = require('crypto');
const { Promotion } = require('../models/Promotion');
const { asyncHandler } = require('../utils/asyncHandler');
const { sanitizeString } = require('../utils/sanitize');
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

function getPlans() {
  const defaults = { starter: { durationDays: 7, amount: 2500 }, growth: { durationDays: 14, amount: 4500 }, spotlight: { durationDays: 30, amount: 8000 } };
  try {
    const configured = JSON.parse(process.env.PROMOTION_PLANS_JSON || 'null');
    return configured && typeof configured === 'object' ? configured : defaults;
  } catch (_) { return defaults; }
}

function publicPlans() {
  return Object.entries(getPlans()).map(([id, value]) => ({ id, durationDays: Number(value.durationDays), amount: Number(value.amount) }))
    .filter((plan) => plan.durationDays > 0 && plan.amount > 0);
}

async function paystack(path, options = {}) {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    const error = new Error('Paystack is not configured.'); error.statusCode = 500; error.publicMessage = 'Payment is not configured yet.'; throw error;
  }
  const response = await fetch(PAYSTACK_BASE_URL + path, { ...options, headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === false) {
    const error = new Error(payload.message || 'Paystack request failed.'); error.statusCode = 400; error.publicMessage = 'Unable to process promotion payment right now.'; throw error;
  }
  return payload.data || {};
}

const getPromotionPlans = asyncHandler(async (_req, res) => res.json({ success: true, data: publicPlans() }));

const getOwnerPromotions = asyncHandler(async (req, res) => {
  const now = new Date();
  await Promotion.updateMany({ business: req.ownerBusiness._id, status: 'active', endsAt: { $lte: now } }, { $set: { status: 'expired' } });
  await Promotion.updateMany({ business: req.ownerBusiness._id, approvalStatus: 'approved', status: 'pending', paymentStatus: 'verified', startsAt: { $lte: now }, endsAt: { $gt: now } }, { $set: { status: 'active' } });
  const promotions = await Promotion.find({ business: req.ownerBusiness._id }).sort({ createdAt: -1 });
  res.json({ success: true, data: promotions });
});

const initializePromotion = asyncHandler(async (req, res) => {
  const business = req.ownerBusiness;
  if (business.status !== 'approved' || business.paymentStatus !== 'verified') return res.status(403).json({ success: false, message: 'Only approved, paid listings can be promoted.' });
  const planId = sanitizeString(req.body.plan || '');
  const plan = getPlans()[planId];
  if (!plan || Number(plan.amount) <= 0 || Number(plan.durationDays) <= 0) return res.status(400).json({ success: false, message: 'Choose a valid promotion plan.' });
  const reference = `maro_promo_${business._id}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
  const promotion = await Promotion.create({ business: business._id, ownerBusiness: business._id, plan: planId, durationDays: Number(plan.durationDays), amount: Number(plan.amount), paymentReference: reference });
  const callback = new URL(process.env.PROMOTION_CALLBACK_URL || 'https://marosolutionapp.com/dashboard.html');
  callback.searchParams.set('promotion', 'success'); callback.searchParams.set('reference', reference);
  const data = await paystack('/transaction/initialize', { method: 'POST', body: JSON.stringify({ email: business.email, amount: Math.round(Number(plan.amount) * 100), reference, callback_url: callback.toString(), metadata: { purpose: 'business_promotion', promotionId: String(promotion._id), businessId: String(business._id), plan: planId } }) });
  promotion.paystackAccessCode = data.access_code || ''; promotion.paystackAuthorizationUrl = data.authorization_url || ''; await promotion.save();
  res.json({ success: true, authorization_url: promotion.paystackAuthorizationUrl });
});

const verifyPromotion = asyncHandler(async (req, res) => {
  const reference = sanitizeString(req.body.reference || '');
  const promotion = await Promotion.findOne({ paymentReference: reference, business: req.ownerBusiness._id });
  if (!promotion) return res.status(404).json({ success: false, message: 'Promotion payment was not found.' });
  const data = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' });
  const metadata = data.metadata || {};
  if (data.status !== 'success' || metadata.purpose !== 'business_promotion' || String(metadata.promotionId) !== String(promotion._id) || Number(data.amount) !== Math.round(promotion.amount * 100)) {
    promotion.paymentStatus = 'failed'; await promotion.save(); return res.status(400).json({ success: false, message: 'Promotion payment could not be verified.' });
  }
  if (promotion.paymentStatus !== 'verified') {
    const now = new Date();
    promotion.paidAt = data.paid_at ? new Date(data.paid_at) : now;
    promotion.paymentStatus = 'verified';
    promotion.approvalStatus = 'pending';
    promotion.status = 'pending';
    await promotion.save();
  }
  res.json({ success: true, message: 'Promotion payment verified and sent for admin approval.', data: promotion });
});

const getAdminPromotions = asyncHandler(async (_req, res) => {
  await Promotion.updateMany({ status: 'active', endsAt: { $lte: new Date() } }, { $set: { status: 'expired' } });
  await Promotion.updateMany({ approvalStatus: 'approved', status: 'pending', paymentStatus: 'verified', startsAt: { $lte: new Date() }, endsAt: { $gt: new Date() } }, { $set: { status: 'active' } });
  const promotions = await Promotion.find().populate('business', 'name email category state localGovernment').sort({ createdAt: -1 });
  res.json({ success: true, data: promotions });
});

const cancelPromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findById(req.params.id);
  if (!promotion) return res.status(404).json({ success: false, message: 'Promotion not found.' });
  promotion.status = 'cancelled'; promotion.cancelledAt = new Date(); await promotion.save();
  res.json({ success: true, message: 'Promotion deactivated. Payment history was preserved.', data: promotion });
});

const approvePromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findById(req.params.id);
  if (!promotion) return res.status(404).json({ success: false, message: 'Promotion not found.' });
  if (promotion.paymentStatus !== 'verified') return res.status(400).json({ success: false, message: 'Only verified promotion payments can be approved.' });
  const now = new Date();
  const latest = await Promotion.findOne({ _id: { $ne: promotion._id }, business: promotion.business, approvalStatus: 'approved', status: { $in: ['active', 'pending'] }, endsAt: { $gt: now } }).sort({ endsAt: -1 });
  const startsAt = latest && latest.endsAt > now ? latest.endsAt : now;
  promotion.approvalStatus = 'approved'; promotion.approvedAt = now; promotion.rejectedAt = undefined;
  promotion.startsAt = startsAt; promotion.endsAt = new Date(startsAt.getTime() + promotion.durationDays * 86400000);
  promotion.status = startsAt <= now ? 'active' : 'pending'; await promotion.save();
  res.json({ success: true, message: 'Promotion approved.', data: promotion });
});

const rejectPromotion = asyncHandler(async (req, res) => {
  const promotion = await Promotion.findById(req.params.id);
  if (!promotion) return res.status(404).json({ success: false, message: 'Promotion not found.' });
  promotion.approvalStatus = 'rejected'; promotion.status = 'cancelled'; promotion.rejectedAt = new Date(); await promotion.save();
  res.json({ success: true, message: 'Promotion rejected.', data: promotion });
});

module.exports = { getPromotionPlans, getOwnerPromotions, initializePromotion, verifyPromotion, getAdminPromotions, approvePromotion, rejectPromotion, cancelPromotion };

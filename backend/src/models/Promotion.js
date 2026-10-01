const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema({
  business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  ownerBusiness: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
  plan: { type: String, required: true, trim: true },
  durationDays: { type: Number, required: true, min: 1, max: 365 },
  amount: { type: Number, required: true, min: 0 },
  paymentReference: { type: String, required: true, unique: true, trim: true, index: true },
  paymentStatus: { type: String, enum: ['initialized', 'verified', 'failed'], default: 'initialized', index: true },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  status: { type: String, enum: ['pending', 'active', 'expired', 'cancelled'], default: 'pending', index: true },
  startsAt: Date,
  endsAt: { type: Date, index: true },
  paidAt: Date,
  paystackAccessCode: { type: String, default: '', select: false },
  paystackAuthorizationUrl: { type: String, default: '', select: false },
  cancelledAt: Date,
  approvedAt: Date,
  rejectedAt: Date,
}, { timestamps: true });

promotionSchema.index({ business: 1, status: 1, startsAt: 1, endsAt: 1 });

const Promotion = mongoose.model('Promotion', promotionSchema);
module.exports = { Promotion };

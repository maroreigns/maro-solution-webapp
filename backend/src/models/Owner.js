const mongoose = require('mongoose');

const ownerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 120, default: '' },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    googleId: { type: String, required: true, unique: true, index: true, select: false },
    authProvider: { type: String, enum: ['google'], default: 'google' },
    avatar: { type: String, trim: true, default: '' },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

ownerSchema.index({ email: 1 }, { unique: true });

const Owner = mongoose.model('Owner', ownerSchema);

module.exports = { Owner };

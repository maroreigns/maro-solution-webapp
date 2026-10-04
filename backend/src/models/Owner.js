const mongoose = require('mongoose');

const ownerSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 120, default: '' },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    emailKey: { type: String, required: true, trim: true, lowercase: true, select: false },
    phone: { type: String, trim: true, default: '' },
    phoneKey: { type: String, trim: true, select: false },
    passwordHash: { type: String, select: false },
    googleId: { type: String, trim: true, select: false },
    authProvider: {
      type: String,
      enum: ['password', 'google', 'password+google'],
      default: 'password',
    },
    avatar: { type: String, trim: true, default: '' },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null },
    lastLoginAt: { type: Date },
    passwordResetCodeHash: { type: String, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    passwordResetAttempts: { type: Number, default: 0, select: false },
    passwordResetRequestedAt: { type: Date, select: false },
    passwordResetVerifiedExpires: { type: Date, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.emailKey;
        delete ret.phoneKey;
        delete ret.passwordHash;
        delete ret.googleId;
        delete ret.passwordResetCodeHash;
        delete ret.passwordResetTokenHash;
        delete ret.passwordResetExpires;
        delete ret.passwordResetAttempts;
        delete ret.passwordResetRequestedAt;
        delete ret.passwordResetVerifiedExpires;
        return ret;
      },
    },
  }
);

ownerSchema.index({ emailKey: 1 }, { unique: true });
ownerSchema.index({ phoneKey: 1 }, { unique: true, sparse: true });
ownerSchema.index({ googleId: 1 }, { unique: true, sparse: true });

const Owner = mongoose.model('Owner', ownerSchema);

module.exports = { Owner };

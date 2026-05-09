const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    localGovernment: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120,
    },
    address: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    profileImage: {
      type: String,
      default: '',
    },
    serviceDescription: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
    serviceImages: {
      type: [String],
      default: [],
    },
    comments: [
      {
        name: {
          type: String,
          trim: true,
          maxlength: 60,
        },
        message: {
          type: String,
          trim: true,
          maxlength: 500,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'initialized', 'verified', 'failed'],
      default: 'unpaid',
      index: true,
    },
    paymentReference: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
    },
    paystackAccessCode: {
      type: String,
      default: '',
      trim: true,
    },
    paystackAuthorizationUrl: {
      type: String,
      default: '',
      trim: true,
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    paidAt: {
      type: Date,
    },
    paymentProof: {
      type: String,
      default: '',
      trim: true,
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
    },
    ratingAverage: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    ratingTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    yearsExperience: {
      type: Number,
      required: true,
      min: 0,
      max: 80,
    },
    passwordHash: {
      type: String,
      select: false,
    },
    passwordResetTokenHash: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    ownerLastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    toJSON: {
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.passwordResetTokenHash;
        delete ret.passwordResetExpires;
        return ret;
      },
    },
    toObject: {
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.passwordResetTokenHash;
        delete ret.passwordResetExpires;
        return ret;
      },
    },
  }
);

businessSchema.index({
  name: 'text',
  category: 'text',
  state: 'text',
  localGovernment: 'text',
  address: 'text',
});

const Business = mongoose.model('Business', businessSchema);

module.exports = { Business };

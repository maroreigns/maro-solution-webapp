/**
 * Business Model
 *
 * Stores public listing details, owner account credentials, payment state,
 * approval state, ratings, comments, uploaded media, and optional map location.
 */
const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema(
  {
    // Public business or provider name shown across listings and profiles.
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    // Service category used for browsing and filtering public listings.
    category: {
      type: String,
      required: true,
      trim: true,
    },
    // Nigerian state and local government used for location-based search.
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
    // Primary contact details shown to visitors and used for owner login.
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
    // Human-readable location; coordinates below are optional map helpers.
    address: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    latitude: {
      type: Number,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      min: -180,
      max: 180,
    },
    googleMapsUrl: {
      type: String,
      trim: true,
      maxlength: 220,
    },
    // Cloudinary-hosted profile image and optional service gallery images.
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
    // Visitor comments stored directly with the listing for profile display.
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
    // Admin review state and Paystack payment lifecycle.
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
    // Rating aggregate fields avoid recalculating averages from every vote.
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
    // Owner authentication and password reset fields are never returned in JSON.
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

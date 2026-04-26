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
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'submitted', 'verified', 'failed'],
      default: 'unpaid',
      index: true,
    },
    paymentReference: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
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
  },
  {
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
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

const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    message: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
    reporterName: {
      type: String,
      default: '',
      trim: true,
      maxlength: 80,
    },
    reporterContact: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120,
    },
    status: {
      type: String,
      enum: ['pending', 'resolved'],
      default: 'pending',
      index: true,
    },
  },
  {
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
  }
);

const Report = mongoose.model('Report', reportSchema);

module.exports = { Report };

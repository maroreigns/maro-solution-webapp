/**
 * Report Model
 *
 * Stores visitor-submitted trust and safety reports for business listings.
 */
const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    // Listing being reported; populated in admin report review screens.
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    // Short required reason shown in the admin report queue.
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    // Optional reporter details for follow-up context.
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
    // Tracks whether an admin has reviewed and resolved the report.
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

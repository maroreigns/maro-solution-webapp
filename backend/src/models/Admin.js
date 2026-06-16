/**
 * Admin Model
 *
 * Stores administrator login credentials and role information for protected
 * admin dashboard actions.
 */
const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema(
  {
    // Unique email address used as the admin login identifier.
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
    },
    // Bcrypt hash; plaintext passwords are never stored.
    passwordHash: {
      type: String,
      required: true,
    },
    // Reserved role field used by JWT authorization checks.
    role: {
      type: String,
      enum: ['admin'],
      default: 'admin',
    },
  },
  {
    timestamps: {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
  }
);

const Admin = mongoose.model('Admin', adminSchema);

module.exports = { Admin };

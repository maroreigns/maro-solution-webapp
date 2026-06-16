/**
 * Admin Controller
 *
 * Handles admin login and current-admin profile responses for the protected
 * admin dashboard.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Admin } = require('../models/Admin');
const { asyncHandler } = require('../utils/asyncHandler');
const { sanitizeString } = require('../utils/sanitize');

/**
 * Build the safe admin payload returned to the frontend.
 *
 * @param {Object} admin Mongoose Admin document.
 * @returns {Object} Public admin identity.
 * @sideeffects None.
 */
function buildAdminPayload(admin) {
  return {
    id: admin._id,
    email: admin.email,
    role: admin.role,
  };
}

/**
 * Sign an admin JWT for dashboard API calls.
 *
 * @param {Object} admin Mongoose Admin document.
 * @returns {string} Signed JWT.
 * @sideeffects Reads JWT_SECRET from the environment.
 */
function signAdminToken(admin) {
  return jwt.sign(
    {
      sub: String(admin._id),
      role: admin.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '8h',
    }
  );
}

/**
 * Authenticate an admin by email and password.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Compares bcrypt password hash and returns a signed JWT.
 */
const loginAdmin = asyncHandler(async (req, res) => {
  const email = sanitizeString(req.body.email || '').toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required.',
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      success: false,
      message: 'Admin authentication is not configured.',
    });
  }

  const admin = await Admin.findOne({ email });
  const isValidPassword = admin
    ? await bcrypt.compare(password, admin.passwordHash)
    : false;

  if (!admin || !isValidPassword) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password.',
    });
  }

  res.json({
    success: true,
    message: 'Admin login successful.',
    token: signAdminToken(admin),
    data: buildAdminPayload(admin),
  });
});

/**
 * Return the currently authenticated admin.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {void}
 * @sideeffects Sends req.admin as a safe public payload.
 */
const getAdminMe = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: buildAdminPayload(req.admin),
  });
});

module.exports = {
  getAdminMe,
  loginAdmin,
};

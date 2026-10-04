/**
 * Business Controller
 *
 * Handles business listing creation, public listing reads, owner dashboard
 * updates, admin review actions, ratings, comments, reports, payment checks,
 * and owner password reset workflows.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Business } = require('../models/Business');
const { Owner } = require('../models/Owner');
const { Report } = require('../models/Report');
const { Promotion } = require('../models/Promotion');
const { asyncHandler } = require('../utils/asyncHandler');
const { escapeHtml, sendEmail } = require('../utils/email');
const { sanitizeString } = require('../utils/sanitize');
const { emailLookup, normalizeEmail, normalizePhone, phoneLookup } = require('../utils/identity');
const { getOwnerJwtSecret } = require('../middleware/ownerAuth');

/**
 * Resolve the public path for an uploaded file.
 *
 * @param {Object|null} file Multer/Cloudinary file metadata.
 * @returns {string} Public upload URL or empty string.
 * @sideeffects None.
 */
function buildImagePath(file) {
  if (!file) {
    return '';
  }

  if (file.path) {
    return file.path;
  }

  return `/uploads/${file.filename}`;
}

/**
 * Return the first uploaded file for a named field.
 *
 * @param {Request} req
 * @param {string} fieldName Multipart field name.
 * @returns {Object|null} Uploaded file metadata.
 * @sideeffects None.
 */
function getUploadedFile(req, fieldName) {
  if (req.file && req.file.fieldname === fieldName) {
    return req.file;
  }

  const files = req.files && req.files[fieldName];
  return Array.isArray(files) ? files[0] : null;
}

/**
 * Return all uploaded files for a named multipart field.
 *
 * @param {Request} req
 * @param {string} fieldName Multipart field name.
 * @returns {Object[]} Uploaded file metadata array.
 * @sideeffects None.
 */
function getUploadedFiles(req, fieldName) {
  const files = req.files && req.files[fieldName];
  return Array.isArray(files) ? files : [];
}

/**
 * Remove a local upload that should not remain after a failed request.
 *
 * @param {string} filePath Public upload path.
 * @returns {void}
 * @sideeffects Deletes a local file when it exists.
 */
function cleanupUploadedFile(filePath) {
  if (!filePath || /^https?:\/\//i.test(filePath)) {
    return;
  }

  const resolvedPath = path.join(__dirname, '..', '..', filePath.replace(/^\//, ''));
  if (fs.existsSync(resolvedPath)) {
    fs.unlinkSync(resolvedPath);
  }
}

/**
 * Remove all uploaded files attached to the current request.
 *
 * @param {Request} req
 * @returns {void}
 * @sideeffects Deletes rejected local uploads.
 */
function cleanupRequestUploads(req) {
  const uploadedFiles = [
    req.file,
    ...Object.values(req.files || {}).flat(),
  ].filter(Boolean);

  uploadedFiles.forEach((file) => cleanupUploadedFile(buildImagePath(file)));
}

/**
 * Hash an owner password reset token before storing it.
 *
 * @param {string} token Raw reset token.
 * @returns {string} SHA-256 token hash.
 * @sideeffects None.
 */
function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const PASSWORD_RESET_CODE_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESET_VERIFIED_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_RESEND_DELAY_MS = 60 * 1000;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function duplicateOwnerIdentityResponse(res, identity) {
  return res.status(409).json({
    success: false,
    message: identity === 'phone'
      ? 'An account already exists with this phone number.'
      : 'An account already exists with this email address.',
  });
}

function duplicateOwnerKeyIdentity(error) {
  if (!error || error.code !== 11000) return '';
  return error.keyPattern && error.keyPattern.phoneKey ? 'phone' : 'email';
}

function clearPasswordReset(business) {
  business.passwordResetCodeHash = undefined;
  business.passwordResetTokenHash = undefined;
  business.passwordResetExpires = undefined;
  business.passwordResetVerifiedExpires = undefined;
  business.passwordResetAttempts = 0;
}

async function findPasswordAccountByEmail(email, selectFields) {
  const owner = await Owner.findOne({
    emailKey: email,
    passwordHash: { $exists: true, $nin: [null, ''] },
  }).select(selectFields);
  if (owner) return { account: owner, kind: 'owner' };

  const business = await Business.findOne({
    email: emailLookup(email),
    ownerId: null,
    passwordHash: { $exists: true, $nin: [null, ''] },
  }).select(selectFields);
  return business ? { account: business, kind: 'legacy-business' } : null;
}

async function findPendingResetAccountByEmail(email, selectFields) {
  const owner = await Owner.findOne({
    emailKey: email,
    passwordResetCodeHash: { $exists: true, $nin: [null, ''] },
  }).select(selectFields);
  if (owner) return owner;
  return Business.findOne({
    email: emailLookup(email),
    ownerId: null,
    passwordResetCodeHash: { $exists: true, $nin: [null, ''] },
  }).select(selectFields);
}

async function findVerifiedResetAccountByEmail(email, selectFields) {
  const owner = await Owner.findOne({
    emailKey: email,
    passwordResetTokenHash: { $exists: true, $nin: [null, ''] },
  }).select(selectFields);
  if (owner) return owner;
  return Business.findOne({
    email: emailLookup(email),
    ownerId: null,
    passwordResetTokenHash: { $exists: true, $nin: [null, ''] },
  }).select(selectFields);
}

/**
 * Build a signed owner JWT for dashboard access.
 *
 * @param {Object} business Business document.
 * @returns {string} Signed owner JWT, or empty string when not configured.
 * @sideeffects Reads owner JWT secret from environment.
 */
function buildOwnerToken(business, owner) {
  const secret = getOwnerJwtSecret();

  if (!secret) {
    return '';
  }

  return jwt.sign(
    {
      sub: String(business._id),
      role: 'business-owner',
      ...(owner ? { ownerId: String(owner._id) } : {}),
    },
    secret,
    {
      expiresIn: '7d',
    }
  );
}

/**
 * Remove sensitive owner fields from a business response payload.
 *
 * @param {Object} business Business document or plain object.
 * @returns {Object} Public-safe business payload.
 * @sideeffects None.
 */
function buildBusinessPayload(business) {
  const payload = typeof business.toJSON === 'function' ? business.toJSON() : { ...business };
  delete payload.passwordHash;
  delete payload.passwordResetTokenHash;
  delete payload.passwordResetCodeHash;
  delete payload.passwordResetAttempts;
  delete payload.passwordResetRequestedAt;
  delete payload.passwordResetExpires;
  delete payload.passwordResetVerifiedExpires;
  delete payload.googleId;
  return payload;
}

/**
 * Build a Google Maps query URL from valid coordinates.
 *
 * @param {number} latitude Business latitude.
 * @param {number} longitude Business longitude.
 * @returns {string} Google Maps URL or empty string.
 * @sideeffects None.
 */
function buildGoogleMapsUrl(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return '';
  }

  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

/**
 * Normalize optional map coordinate fields from a request body.
 *
 * @param {Object} body Request body.
 * @returns {Object} Location fields ready for assignment.
 * @sideeffects None.
 */
function getLocationFields(body) {
  const hasLatitudeField = Object.prototype.hasOwnProperty.call(body, 'latitude');
  const hasLongitudeField = Object.prototype.hasOwnProperty.call(body, 'longitude');

  if (!hasLatitudeField && !hasLongitudeField) {
    return {};
  }

  const latitudeText = String(body.latitude || '').trim();
  const longitudeText = String(body.longitude || '').trim();

  if (!latitudeText && !longitudeText) {
    return {
      latitude: undefined,
      longitude: undefined,
      googleMapsUrl: '',
    };
  }

  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);

  return {
    latitude,
    longitude,
    googleMapsUrl: buildGoogleMapsUrl(latitude, longitude),
  };
}

/**
 * Validate owner password and confirmation fields.
 *
 * @param {string} password Submitted password.
 * @param {string} confirmPassword Submitted confirmation password.
 * @returns {string} Error message, or empty string when valid.
 * @sideeffects None.
 */
function validatePasswordFields(password, confirmPassword) {
  if (!password || password.length < 6) {
    return 'Password must be at least 6 characters.';
  }

  if (password !== confirmPassword) {
    return 'Confirm password must match password.';
  }

  return '';
}

/**
 * Build MongoDB filters for public listing search.
 *
 * @param {Object} query Express query object.
 * @returns {Object} MongoDB filter object.
 * @sideeffects None.
 */
function buildFilters(query) {
  const filters = {
    status: 'approved',
    paymentStatus: 'verified',
  };
  const category = sanitizeString(query.category);
  const state = sanitizeString(query.state);
  const localGovernment = sanitizeString(query.localGovernment);
  const keyword = sanitizeString(query.keyword);

  if (category) {
    filters.category = category;
  }

  if (state) {
    filters.state = state;
  }

  if (localGovernment) {
    filters.localGovernment = localGovernment;
  }

  if (keyword) {
    filters.$or = [
      { name: { $regex: keyword, $options: 'i' } },
      { category: { $regex: keyword, $options: 'i' } },
      { address: { $regex: keyword, $options: 'i' } },
    ];
  }

  return filters;
}

/**
 * List approved and paid businesses for public browsing.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Queries MongoDB and sends JSON response.
 */
const getBusinesses = asyncHandler(async (req, res) => {
  const filters = buildFilters(req.query);
  const businesses = await Business.find(filters)
    .select('name category state localGovernment profileImage status phoneVerified ratingAverage ratingCount createdAt')
    .sort({ createdAt: -1 })
    .lean();
  const now = new Date();
  await Promotion.updateMany({ status: 'active', endsAt: { $lte: now } }, { $set: { status: 'expired' } });
  await Promotion.updateMany({ approvalStatus: 'approved', status: 'pending', paymentStatus: 'verified', startsAt: { $lte: now }, endsAt: { $gt: now } }, { $set: { status: 'active' } });
  const activePromotions = await Promotion.find({
    business: { $in: businesses.map((business) => business._id) },
    paymentStatus: 'verified',
    approvalStatus: 'approved',
    status: 'active',
    startsAt: { $lte: now },
    endsAt: { $gt: now },
  }).sort({ startsAt: 1, createdAt: 1 }).lean();
  const promoted = new Map(activePromotions.map((promotion) => [String(promotion.business), promotion]));
  businesses.forEach((business) => {
    const promotion = promoted.get(String(business._id));
    business.isPromoted = Boolean(promotion);
    if (promotion) business.promotionEndsAt = promotion.endsAt;
  });
  businesses.sort((a, b) => Number(b.isPromoted) - Number(a.isPromoted) || new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    success: true,
    count: businesses.length,
    data: businesses,
  });
});

/**
 * Load one approved and paid business profile by ID.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Queries MongoDB and sends JSON response.
 */
const getBusinessById = asyncHandler(async (req, res) => {
  const business = await Business.findOne({
    _id: req.params.id,
    status: 'approved',
    paymentStatus: 'verified',
  });

  if (!business) {
    return res.status(404).json({
      success: false,
      message: 'Business not found.',
    });
  }

  res.json({
    success: true,
    data: business,
  });
});

/**
 * Convert listing status fields into an owner-facing status message.
 *
 * @param {Object} business Business document.
 * @returns {string} Human-readable status message.
 * @sideeffects None.
 */
function getOwnerStatusMessage(business) {
  if (business.status === 'approved' && business.paymentStatus === 'verified') {
    return 'Congratulations! Your business listing has been approved and is now live on VOMA.';
  }

  if (business.status === 'rejected') {
    return 'Your business listing was not approved. Please contact admin for more information.';
  }

  if (business.paymentStatus === 'verified') {
    return 'Payment verified. Your listing is pending admin approval.';
  }

  if (business.paymentStatus === 'initialized') {
    return 'Payment has been initialized. Complete Paystack payment so admin can review your listing.';
  }

  if (business.paymentStatus === 'failed') {
    return 'Payment could not be verified. Please contact admin if you completed payment.';
  }

  return 'Your business was submitted. Please complete payment so admin can review your listing.';
}

/**
 * Return post-submission listing status for an owner.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Queries MongoDB and sends JSON response.
 */
const getBusinessOwnerStatus = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id).select(
    'name status paymentStatus paymentReference'
  );

  if (!business) {
    return res.status(404).json({
      success: false,
      message: 'Business not found.',
    });
  }

  const reference = sanitizeString(req.query.reference || '');

  if (
    reference &&
    business.paymentReference &&
    reference !== business.paymentReference
  ) {
    return res.status(404).json({
      success: false,
      message: 'Business not found for this payment reference.',
    });
  }

  res.json({
    success: true,
    message: getOwnerStatusMessage(business),
    data: {
      _id: business._id,
      id: business._id,
      name: business.name,
      status: business.status,
      paymentStatus: business.paymentStatus,
      isLive: business.status === 'approved' && business.paymentStatus === 'verified',
    },
  });
});

/**
 * Create a new business listing from multipart form data.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Hashes password, saves listing, and may clean rejected uploads.
 */
const createBusiness = asyncHandler(async (req, res) => {
  const profileImage = getUploadedFile(req, 'profileImage');
  const serviceImages = getUploadedFiles(req, 'serviceImages').map(buildImagePath);
  const email = normalizeEmail(req.body.email);
  const phoneKey = normalizePhone(req.body.phone);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const confirmPassword =
    typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';
  const authenticatedOwner = req.ownerAccount || null;
  const passwordError = authenticatedOwner ? '' : validatePasswordFields(password, confirmPassword);

  if (passwordError) {
    cleanupRequestUploads(req);
    return res.status(400).json({
      success: false,
      message: passwordError,
      errors: [{ field: password.length < 6 ? 'password' : 'confirmPassword', message: passwordError }],
    });
  }

  let owner = authenticatedOwner;
  let ownerCreatedHere = false;
  if (!owner) {
    const emailOwner = await Owner.exists({ emailKey: email });
    if (emailOwner) {
      cleanupRequestUploads(req);
      return duplicateOwnerIdentityResponse(res, 'email');
    }
    const phoneOwner = phoneKey ? await Owner.exists({ phoneKey }) : null;
    if (phoneOwner) {
      cleanupRequestUploads(req);
      return duplicateOwnerIdentityResponse(res, 'phone');
    }

    try {
      owner = await Owner.create({
        name: req.body.name,
        email,
        emailKey: email,
        phone: req.body.phone,
        phoneKey: phoneKey || undefined,
        passwordHash: await bcrypt.hash(password, 12),
        authProvider: 'password',
      });
      ownerCreatedHere = true;
    } catch (error) {
      const duplicateIdentity = duplicateOwnerKeyIdentity(error);
      if (duplicateIdentity) {
        cleanupRequestUploads(req);
        return duplicateOwnerIdentityResponse(res, duplicateIdentity);
      }
      throw error;
    }
  }

  const locationFields = getLocationFields(req.body);

  let business;
  try {
    business = await Business.create({
      name: req.body.name,
      category: req.body.category,
      state: req.body.state,
      localGovernment: req.body.localGovernment,
      phone: req.body.phone,
      email,
      address: req.body.address,
      ...locationFields,
      profileImage: buildImagePath(profileImage),
      serviceDescription: sanitizeString(req.body.serviceDescription) || '',
      serviceImages,
      yearsExperience: Number(req.body.yearsExperience),
      ownerId: owner._id,
      status: 'pending',
      paymentStatus: 'unpaid',
    });
  } catch (error) {
    if (ownerCreatedHere) await Owner.deleteOne({ _id: owner._id, businessId: null });
    cleanupRequestUploads(req);
    throw error;
  }

  if (!owner.businessId) {
    owner.businessId = business._id;
    await owner.save();
  }

  res.status(201).json({
    success: true,
    message: 'Business submitted. Proceed to payment to complete your listing.',
    data: {
      _id: business._id,
      id: business._id,
      status: business.status,
      paymentStatus: business.paymentStatus,
    },
    token: buildOwnerToken(business, owner),
  });
});

/**
 * Authenticate a business owner by email or phone.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Updates owner last login timestamp and returns a JWT.
 */
const loginBusinessOwner = asyncHandler(async (req, res) => {
  const identifier = sanitizeString(
    req.body.identifier || req.body.emailOrPhone || req.body.email || req.body.phone || ''
  );
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email or phone and password are required.',
    });
  }

  const secret = getOwnerJwtSecret();
  if (!secret) {
    return res.status(500).json({
      success: false,
      message: 'Owner authentication is not configured.',
    });
  }

  const looksLikeEmail = identifier.includes('@');
  const identityKey = looksLikeEmail ? normalizeEmail(identifier) : normalizePhone(identifier);
  const owner = await Owner.findOne(looksLikeEmail ? { emailKey: identityKey } : { phoneKey: identityKey })
    .select('+passwordHash');

  if (owner && owner.passwordHash && await bcrypt.compare(password, owner.passwordHash)) {
    const business = owner.businessId
      ? await Business.findById(owner.businessId)
      : await Business.findOne({ ownerId: owner._id });
    if (!business) {
      return res.status(403).json({
        success: false,
        message: 'Your owner account is active. Add a business before opening the dashboard.',
      });
    }
    owner.lastLoginAt = new Date();
    await owner.save();
    return res.json({
      success: true,
      message: 'Owner login successful.',
      token: buildOwnerToken(business, owner),
      data: buildBusinessPayload(business),
    });
  }

  const legacyMatches = await Business.find({
    ...(looksLikeEmail ? { email: emailLookup(identityKey) } : { phone: phoneLookup(identityKey) }),
    passwordHash: { $exists: true, $nin: [null, ''] },
  }).select('+passwordHash').limit(2);
  const validLegacyMatches = [];
  for (const candidate of legacyMatches) {
    if (await bcrypt.compare(password, candidate.passwordHash || '')) {
      validLegacyMatches.push(candidate);
    }
  }
  const business = validLegacyMatches[0] || null;
  const ambiguousLegacyIdentity = validLegacyMatches.length > 1;

  if (!business) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email, phone, or password.',
    });
  }

  let linkedOwner = business.ownerId
    ? await Owner.findById(business.ownerId).select('+passwordHash')
    : null;
  if (!linkedOwner && !ambiguousLegacyIdentity) {
    const emailKey = normalizeEmail(business.email);
    const phoneKey = normalizePhone(business.phone);
    const [emailOwner, phoneOwner] = await Promise.all([
      emailKey ? Owner.findOne({ emailKey }).select('+passwordHash') : null,
      phoneKey ? Owner.findOne({ phoneKey }).select('+passwordHash') : null,
    ]);
    const identitiesConflict = emailOwner && phoneOwner && String(emailOwner._id) !== String(phoneOwner._id);
    const candidateOwner = identitiesConflict ? null : (emailOwner || phoneOwner);

    if (candidateOwner && (!candidateOwner.businessId || String(candidateOwner.businessId) === String(business._id))) {
      linkedOwner = candidateOwner;
    } else if (!candidateOwner && emailKey && !identitiesConflict) {
      try {
        linkedOwner = await Owner.create({
          name: business.name,
          email: emailKey,
          emailKey,
          phone: business.phone || '',
          phoneKey: phoneKey || undefined,
          passwordHash: business.passwordHash,
          authProvider: 'password',
          businessId: business._id,
          lastLoginAt: new Date(),
        });
      } catch (error) {
        if (!duplicateOwnerKeyIdentity(error)) throw error;
      }
    }

    if (linkedOwner && (!linkedOwner.businessId || String(linkedOwner.businessId) === String(business._id))) {
      if (!linkedOwner.passwordHash) {
        linkedOwner.passwordHash = business.passwordHash;
        linkedOwner.authProvider = linkedOwner.authProvider === 'google' || linkedOwner.authProvider === 'password+google'
          ? 'password+google'
          : 'password';
      }
      linkedOwner.businessId = business._id;
      linkedOwner.lastLoginAt = new Date();
      await linkedOwner.save();
      business.ownerId = linkedOwner._id;
    }
  }

  business.ownerLastLoginAt = new Date();
  await business.save();

  return res.json({
    success: true,
    message: 'Owner login successful.',
    token: buildOwnerToken(business, linkedOwner),
    data: buildBusinessPayload(business),
  });
});

/**
 * Return the authenticated owner business document.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {void}
 * @sideeffects Sends a sanitized business payload.
 */
const getOwnerMe = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: buildBusinessPayload(req.ownerBusiness),
  });
});

/**
 * Update owner-managed business profile details.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Mutates and saves req.ownerBusiness.
 */
const updateOwnerProfile = asyncHandler(async (req, res) => {
  const business = req.ownerBusiness;
  const email = normalizeEmail(req.body.email);

  business.name = req.body.name;
  business.category = req.body.category;
  business.state = req.body.state;
  business.localGovernment = req.body.localGovernment;
  business.phone = req.body.phone;
  business.email = email;
  business.address = req.body.address;
  Object.assign(business, getLocationFields(req.body));
  business.serviceDescription = sanitizeString(req.body.serviceDescription) || '';
  business.yearsExperience = Number(req.body.yearsExperience);

  await business.save();

  res.json({
    success: true,
    message: 'Business details updated successfully.',
    data: buildBusinessPayload(business),
  });
});

/**
 * Update owner-managed business photos.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Saves new Cloudinary image URLs on req.ownerBusiness.
 */
const updateOwnerPhotos = asyncHandler(async (req, res) => {
  const business = req.ownerBusiness;
  const profileImage = getUploadedFile(req, 'profileImage');
  const serviceImages = getUploadedFiles(req, 'serviceImages').map(buildImagePath);

  if (profileImage) {
    business.profileImage = buildImagePath(profileImage);
  }

  if (serviceImages.length) {
    business.serviceImages = serviceImages.slice(0, 3);
  }

  await business.save();

  res.json({
    success: true,
    message: 'Business photos updated successfully.',
    data: buildBusinessPayload(business),
  });
});

/**
 * Start owner password reset when an account exists.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Stores reset token hash and may send reset email.
 */
const forgotOwnerPassword = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  }

  const passwordAccount = await findPasswordAccountByEmail(email,
    '+passwordHash +passwordResetCodeHash +passwordResetTokenHash +passwordResetExpires +passwordResetAttempts +passwordResetRequestedAt +passwordResetVerifiedExpires'
  );

  if (!passwordAccount) {
    const owner = await Owner.findOne({ emailKey: email }).select('authProvider');
    if (owner) {
      return res.status(400).json({
        success: false,
        message: 'This account uses Google Sign-In. Please continue with Google.',
      });
    }
    const listingOnly = await Business.exists({ email: emailLookup(email) });
    return res.status(listingOnly ? 409 : 404).json({
      success: false,
      message: listingOnly
        ? 'This email is attached to a business listing, but no password login account has been created for it yet.'
        : 'No account was found with this email address.',
    });
  }
  const account = passwordAccount.account;

  if (
    account.passwordResetRequestedAt &&
    account.passwordResetRequestedAt.getTime() > Date.now() - PASSWORD_RESET_RESEND_DELAY_MS
  ) {
    return res.status(429).json({
      success: false,
      message: 'Please wait before requesting another reset code.',
    });
  }

  const resetCode = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  account.passwordResetCodeHash = await bcrypt.hash(resetCode, 12);
  account.passwordResetTokenHash = undefined;
  account.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_CODE_TTL_MS);
  account.passwordResetVerifiedExpires = undefined;
  account.passwordResetAttempts = 0;
  account.passwordResetRequestedAt = new Date();
  await account.save();

  const sent = await sendEmail({
    to: account.email,
    subject: 'Your VOMA password reset code',
    text: `VOMA

Password Reset

We received a request to reset your VOMA password.

Your password reset code is: ${resetCode}

This code expires in 15 minutes.

If you did not request a password reset, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;color:#171717;line-height:1.6">
<h1 style="margin-bottom:4px">VOMA</h1>
<h2>Password Reset</h2>
<p>We received a request to reset your VOMA password.</p>
<p>Your password reset code is:</p>
<p style="font-size:30px;font-weight:700;letter-spacing:8px">${escapeHtml(resetCode)}</p>
<p>This code expires in 15 minutes.</p>
<p>If you did not request a password reset, you can ignore this email.</p>
</div>`,
  });

  if (!sent) {
    clearPasswordReset(account);
    account.passwordResetRequestedAt = undefined;
    await account.save();
    return res.status(502).json({ success: false, message: 'Something went wrong. Please try again.' });
  }

  return res.json({
    success: true,
    message: 'Password reset code sent. Check your email to continue.',
  });
});

const verifyOwnerResetCode = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';

  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, message: 'The reset code is incorrect.' });
  }

  const account = await findPendingResetAccountByEmail(email,
    '+passwordResetCodeHash +passwordResetTokenHash +passwordResetExpires +passwordResetAttempts +passwordResetVerifiedExpires'
  );

  if (!account || !account.passwordResetCodeHash || !account.passwordResetExpires) {
    return res.status(400).json({ success: false, message: 'The reset code is incorrect.' });
  }

  if (account.passwordResetExpires.getTime() <= Date.now()) {
    clearPasswordReset(account);
    await account.save();
    return res.status(400).json({
      success: false,
      message: 'This reset code has expired. Request a new one.',
    });
  }

  if ((account.passwordResetAttempts || 0) >= PASSWORD_RESET_MAX_ATTEMPTS) {
    clearPasswordReset(account);
    await account.save();
    return res.status(429).json({
      success: false,
      message: 'Too many incorrect attempts. Request a new reset code.',
    });
  }

  const isCorrect = await bcrypt.compare(code, account.passwordResetCodeHash);
  if (!isCorrect) {
    account.passwordResetAttempts = (account.passwordResetAttempts || 0) + 1;
    if (account.passwordResetAttempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      clearPasswordReset(account);
    }
    await account.save();
    return res.status(400).json({ success: false, message: 'The reset code is incorrect.' });
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  account.passwordResetTokenHash = hashResetToken(resetToken);
  account.passwordResetVerifiedExpires = new Date(Date.now() + PASSWORD_RESET_VERIFIED_TTL_MS);
  account.passwordResetCodeHash = undefined;
  account.passwordResetAttempts = 0;
  await account.save();

  return res.json({ success: true, resetToken });
});

/**
 * Complete owner password reset with a valid token.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Updates password hash and clears reset token fields.
 */
const resetOwnerPassword = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const token = typeof req.body.resetToken === 'string' ? req.body.resetToken.trim() : '';
  const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
  const confirmPassword =
    typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';
  const passwordError = validatePasswordFields(newPassword, confirmPassword);

  if (!email || !token) {
    return res.status(400).json({
      success: false,
      message: 'Email and verified reset session are required.',
    });
  }

  if (passwordError) {
    return res.status(400).json({
      success: false,
      message: passwordError,
    });
  }

  const account = await findVerifiedResetAccountByEmail(email,
    '+passwordResetTokenHash +passwordResetVerifiedExpires'
  );
  const tokenHash = hashResetToken(token);
  const hasValidReset =
    account &&
    account.passwordResetTokenHash &&
    account.passwordResetTokenHash === tokenHash &&
    account.passwordResetVerifiedExpires &&
    account.passwordResetVerifiedExpires.getTime() > Date.now();

  if (!hasValidReset) {
    return res.status(400).json({
      success: false,
      message: 'Your verified reset session has expired. Request a new code.',
    });
  }

  account.passwordHash = await bcrypt.hash(newPassword, 12);
  clearPasswordReset(account);
  account.passwordResetRequestedAt = undefined;
  await account.save();

  res.json({
    success: true,
    message: 'Password reset successful. You can now log in with your new password.',
  });
});

/**
 * Load businesses that need admin payment or approval review.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Queries MongoDB and sends admin queue response.
 */
const getPendingBusinesses = asyncHandler(async (req, res) => {
  const businesses = await Business.find({
    status: { $ne: 'rejected' },
    $or: [
      { status: 'pending' },
      { paymentStatus: { $in: ['unpaid', 'initialized', 'failed'] } },
    ],
  }).sort({ paymentStatus: -1, createdAt: -1 });

  res.json({
    success: true,
    count: businesses.length,
    data: businesses,
  });
});

/**
 * Load unresolved business reports for admin review.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Queries reports and populates basic business details.
 */
const getBusinessReports = asyncHandler(async (req, res) => {
  const reports = await Report.find({ status: 'pending' })
    .populate('businessId', 'name phone category state localGovernment status phoneVerified')
    .sort({ createdAt: -1 })
    .limit(100);

  res.json({
    success: true,
    count: reports.length,
    data: reports,
  });
});

/**
 * Check whether a string is a valid MongoDB ObjectId.
 *
 * @param {string} id Candidate ID.
 * @returns {boolean} True when valid.
 * @sideeffects None.
 */
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Mark a business report as resolved.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Updates report status.
 */
const resolveBusinessReport = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid report ID.',
    });
  }

  const report = await Report.findById(req.params.id);

  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Report not found.',
    });
  }

  report.status = 'resolved';
  await report.save();

  return res.json({
    success: true,
    message: 'Report marked as resolved.',
    data: report,
  });
});

/**
 * Delete a business report from the admin queue.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Deletes a Report document.
 */
const deleteBusinessReport = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid report ID.',
    });
  }

  const report = await Report.findById(req.params.id);

  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Report not found.',
    });
  }

  await report.deleteOne();

  return res.json({
    success: true,
    message: 'Report deleted successfully.',
  });
});

/**
 * Shared helper for admin approval-state updates.
 *
 * @param {Request} req
 * @param {Response} res
 * @param {Object} updates Fields to assign to the business.
 * @param {string} message Success message.
 * @param {Function} onUpdated Optional post-save callback.
 * @returns {Promise<Response>}
 * @sideeffects Mutates and saves a Business document.
 */
async function updateApprovalState(req, res, updates, message, onUpdated) {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return res.status(404).json({
      success: false,
      message: 'Business not found.',
    });
  }

  const previousStatus = business.status;
  Object.assign(business, updates);
  await business.save();

  if (typeof onUpdated === 'function') {
    await onUpdated(business, { previousStatus });
  }

  return res.json({
    success: true,
    message,
    data: business,
  });
}

/**
 * Send the business approval notification email.
 *
 * @param {Object} business Business document.
 * @returns {Promise<void>}
 * @sideeffects Sends email through the shared email utility when possible.
 */
async function sendApprovalEmail(business) {
  console.log(`[email-hook] approve business reached for ${business._id}.`);

  if (!business.email) {
    console.warn(`[email-hook] approve business skipped for ${business._id}: business email is missing.`);
    return;
  }

  const businessName = business.name || 'there';
  const text = `Hello ${businessName},

Congratulations! Your business listing has been approved and is now live on VOMA.
Customers can now find your business and contact you directly through WhatsApp or phone.`;

  await sendEmail({
    to: business.email,
    subject: 'Your listing is now live on VOMA',
    text,
    html: `<p>Hello ${escapeHtml(businessName)},</p>
<p>Congratulations! Your business listing has been approved and is now live on VOMA.</p>
<p>Customers can now find your business and contact you directly through WhatsApp or phone.</p>`,
  });
}

/**
 * Send the business rejection notification email.
 *
 * @param {Object} business Business document.
 * @param {Object} state Previous approval state context.
 * @returns {Promise<void>}
 * @sideeffects Sends email through the shared email utility when possible.
 */
async function sendRejectionEmail(business, state = {}) {
  console.log(`[email-hook] reject business reached for ${business._id}.`);

  if (state.previousStatus === 'rejected') {
    console.warn(`[email-hook] reject business skipped for ${business._id}: already rejected.`);
    return;
  }

  if (!business.email) {
    console.warn(`[email-hook] reject business skipped for ${business._id}: business email is missing.`);
    return;
  }

  const businessName = business.name || 'there';
  const text = `Hello ${businessName},

Your business listing was not approved at this time.
Please contact VOMA support for more information.`;

  await sendEmail({
    to: business.email,
    subject: 'Update on your VOMA listing',
    text,
    html: `<p>Hello ${escapeHtml(businessName)},</p>
<p>Your business listing was not approved at this time.</p>
<p>Please contact VOMA support for more information.</p>`,
  });
}

/**
 * Verify payment for a business using its saved Paystack reference.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Calls payment verification and updates payment fields.
 */
const verifyPayment = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return res.status(404).json({
      success: false,
      message: 'Business not found.',
    });
  }

  if (!business.paymentReference) {
    return res.status(400).json({
      success: false,
      message: 'No Paystack payment reference found for this business.',
    });
  }

  const { verifyAndSavePayment } = require('./paymentController');
  await verifyAndSavePayment(business.paymentReference);

  return res.json({
    success: true,
    message: 'Payment verified. Your listing is pending admin approval.',
  });
});

/**
 * Reject a listing payment from the admin dashboard.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Sets paymentStatus failed and status rejected.
 */
const rejectPayment = asyncHandler(async (req, res) =>
  updateApprovalState(
    req,
    res,
    {
      paymentStatus: 'failed',
      status: 'rejected',
    },
    'Payment rejected and business marked as rejected.'
  )
);

/**
 * Approve a paid business listing for public display.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Updates status and may send approval email.
 */
const approveBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return res.status(404).json({
      success: false,
      message: 'Business not found.',
    });
  }

  if (business.paymentStatus !== 'verified') {
    return res.status(400).json({
      success: false,
      message: 'Payment must be verified before this business can be approved.',
    });
  }

  const previousStatus = business.status;
  business.status = 'approved';
  await business.save();

  if (previousStatus !== 'approved') {
    await sendApprovalEmail(business);
  } else {
    console.warn(`[email-hook] approve business skipped for ${business._id}: already approved.`);
  }

  return res.json({
    success: true,
    message: 'Business approved.',
    data: business,
  });
});

/**
 * Mark a business phone number as verified.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Updates phoneVerified on the Business document.
 */
const verifyBusinessPhone = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return res.status(404).json({
      success: false,
      message: 'Business not found.',
    });
  }

  business.phoneVerified = true;
  await business.save();

  return res.json({
    success: true,
    message: 'Phone marked as verified.',
    data: business,
  });
});

/**
 * Reject a business listing after admin review.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Updates status and may send rejection email.
 */
const rejectBusiness = asyncHandler(async (req, res) =>
  updateApprovalState(
    req,
    res,
    {
      status: 'rejected',
    },
    'Business rejected.',
    sendRejectionEmail
  )
);

/**
 * Update business details through the admin-compatible edit endpoint.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Saves business fields and may replace profile image.
 */
const updateBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    if (req.file) {
      cleanupUploadedFile(`/uploads/${req.file.filename}`);
    }

    return res.status(404).json({
      success: false,
      message: 'Business not found.',
    });
  }

  const newProfileImage = req.file ? buildImagePath(req.file) : business.profileImage;
  const email = normalizeEmail(req.body.email);

  if (req.file && business.profileImage) {
    cleanupUploadedFile(business.profileImage);
  }

  business.name = req.body.name;
  business.category = req.body.category;
  business.state = req.body.state;
  business.localGovernment = req.body.localGovernment;
  business.phone = req.body.phone;
  business.email = email;
  business.address = req.body.address;
  Object.assign(business, getLocationFields(req.body));
  business.profileImage = newProfileImage;
  business.yearsExperience = Number(req.body.yearsExperience);

  await business.save();

  res.json({
    success: true,
    message: 'Business updated successfully.',
    data: business,
  });
});

/**
 * Delete a business listing and related reports.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Deletes uploads, reports, and the Business document.
 */
const deleteBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return res.status(404).json({
      success: false,
      message: 'Business not found.',
    });
  }

  if (business.profileImage) {
    cleanupUploadedFile(business.profileImage);
  }

  await Report.deleteMany({ businessId: business._id });
  await business.deleteOne();

  res.json({
    success: true,
    message: 'Business deleted successfully.',
  });
});

/**
 * Add a visitor rating to a business profile.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Updates rating aggregate fields.
 */
const rateBusiness = asyncHandler(async (req, res) => {
  const rating = req.body.rating;

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({
      success: false,
      message: 'Rating must be a number between 1 and 5.',
    });
  }

  const business = await Business.findById(req.params.id);

  if (!business) {
    return res.status(404).json({
      success: false,
      message: 'Business not found.',
    });
  }

  business.ratingTotal = (Number(business.ratingTotal) || 0) + rating;
  business.ratingCount = (Number(business.ratingCount) || 0) + 1;
  business.ratingAverage = Number((business.ratingTotal / business.ratingCount).toFixed(2));

  await business.save();

  res.json({
    success: true,
    message: 'Thanks for rating.',
    data: {
      _id: business._id,
      ratingAverage: business.ratingAverage,
      ratingCount: business.ratingCount,
      ratingTotal: business.ratingTotal,
    },
  });
});

/**
 * Add a visitor comment to an approved business profile.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Appends a comment to the Business document.
 */
const addBusinessComment = asyncHandler(async (req, res) => {
  const name = sanitizeString(String(req.body.name || ''));
  const message = sanitizeString(String(req.body.message || ''));

  if (!name || !message) {
    return res.status(400).json({
      success: false,
      message: 'Name and comment are required.',
    });
  }

  if (name.length > 60) {
    return res.status(400).json({
      success: false,
      message: 'Name must be 60 characters or fewer.',
    });
  }

  if (message.length > 500) {
    return res.status(400).json({
      success: false,
      message: 'Comment must be 500 characters or fewer.',
    });
  }

  const business = await Business.findOne({
    _id: req.params.id,
    status: 'approved',
    paymentStatus: 'verified',
  });

  if (!business) {
    return res.status(404).json({
      success: false,
      message: 'Business not found.',
    });
  }

  const comment = {
    name,
    message,
    createdAt: new Date(),
  };

  business.comments.push(comment);
  await business.save();

  res.status(201).json({
    success: true,
    message: 'Comment added.',
    data: business.comments[business.comments.length - 1],
  });
});

/**
 * Submit a visitor report for an approved business.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Creates a Report document and may email admins.
 */
const reportBusiness = asyncHandler(async (req, res) => {
  const reason = sanitizeString(String(req.body.reason || ''));
  const message = sanitizeString(String(req.body.message || ''));
  const reporterName = sanitizeString(String(req.body.reporterName || ''));
  const reporterContact = sanitizeString(String(req.body.reporterContact || ''));

  if (!reason) {
    return res.status(400).json({
      success: false,
      message: 'Report reason is required.',
    });
  }

  if (reason.length > 120) {
    return res.status(400).json({
      success: false,
      message: 'Report reason must be 120 characters or fewer.',
    });
  }

  if (message.length > 1000) {
    return res.status(400).json({
      success: false,
      message: 'Report message must be 1000 characters or fewer.',
    });
  }

  if (reporterName.length > 80) {
    return res.status(400).json({
      success: false,
      message: 'Reporter name must be 80 characters or fewer.',
    });
  }

  if (reporterContact.length > 120) {
    return res.status(400).json({
      success: false,
      message: 'Reporter contact must be 120 characters or fewer.',
    });
  }

  const business = await Business.findOne({
    _id: req.params.id,
    status: 'approved',
    paymentStatus: 'verified',
  });

  if (!business) {
    return res.status(404).json({
      success: false,
      message: 'Business not found.',
    });
  }

  const report = await Report.create({
    businessId: business._id,
    reason,
    message,
    reporterName,
    reporterContact,
    status: 'pending',
  });

  console.log(`[email-hook] report business reached for ${business._id}; report ${report._id} created.`);

  const text = `New business report submitted

Business name: ${business.name || ''}
Report reason: ${reason}
Report message: ${message || ''}
Reporter name: ${reporterName || 'Not provided'}
Reporter contact: ${reporterContact || 'Not provided'}`;

  await sendEmail({
    to: process.env.ADMIN_NOTIFICATION_EMAIL,
    subject: 'New business report submitted',
    text,
    html: `<p>New business report submitted</p>
<ul>
  <li><strong>Business name:</strong> ${escapeHtml(business.name || '')}</li>
  <li><strong>Report reason:</strong> ${escapeHtml(reason)}</li>
  <li><strong>Report message:</strong> ${escapeHtml(message || '')}</li>
  <li><strong>Reporter name:</strong> ${escapeHtml(reporterName || 'Not provided')}</li>
  <li><strong>Reporter contact:</strong> ${escapeHtml(reporterContact || 'Not provided')}</li>
</ul>`,
  });

  res.status(201).json({
    success: true,
    message: 'Report submitted. Thank you for helping keep VOMA trusted.',
    data: report,
  });
});

module.exports = {
  addBusinessComment,
  approveBusiness,
  createBusiness,
  deleteBusiness,
  deleteBusinessReport,
  forgotOwnerPassword,
  getBusinessById,
  getBusinessOwnerStatus,
  getBusinessReports,
  getBusinesses,
  getPendingBusinesses,
  getOwnerMe,
  loginBusinessOwner,
  rateBusiness,
  reportBusiness,
  resolveBusinessReport,
  rejectBusiness,
  rejectPayment,
  resetOwnerPassword,
  updateBusiness,
  updateOwnerPhotos,
  updateOwnerProfile,
  verifyBusinessPhone,
  verifyOwnerResetCode,
  verifyPayment,
};

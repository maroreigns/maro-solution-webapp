const { body, validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const { businessCategories } = require('../data/categories');
const { nigeriaStatesAndLgas, nigeriaStates } = require('../data/nigeriaData');
const { sanitizeString } = require('../utils/sanitize');

const phoneRegex = /^\+?[0-9\s-]{7,20}$/;
const suspiciousTextRegex = /(?:<|>|\{|\}|\$|\[|\]|javascript:|data:)/i;

function rejectSuspiciousText(value) {
  if (typeof value !== 'string' || suspiciousTextRegex.test(value)) {
    throw new Error('This field contains invalid characters.');
  }

  return true;
}

function validateExperienceLength(value) {
  if (String(value).trim().length > 2) {
    throw new Error('Years of experience must be between 0 and 80.');
  }

  return true;
}

function validateLocalGovernment(value, { req }) {
  const state = sanitizeString(req.body.state);

  if (!state || !nigeriaStatesAndLgas[state]) {
    throw new Error('Please select a valid state first.');
  }

  if (!nigeriaStatesAndLgas[state].includes(value)) {
    throw new Error('Selected local government does not belong to the chosen state.');
  }

  return true;
}

const businessValidationRules = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Full name or business name is required.')
    .isLength({ min: 2, max: 120 })
    .withMessage('Name must be between 2 and 120 characters.')
    .custom(rejectSuspiciousText),
  body('category')
    .trim()
    .notEmpty()
    .withMessage('Service category is required.')
    .isLength({ max: 80 })
    .withMessage('Service category is too long.')
    .isIn(businessCategories)
    .withMessage('Please choose a valid service category.')
    .custom(rejectSuspiciousText),
  body('state')
    .trim()
    .notEmpty()
    .withMessage('State is required.')
    .isLength({ max: 60 })
    .withMessage('State is too long.')
    .isIn(nigeriaStates)
    .withMessage('Please choose a valid Nigerian state or FCT.')
    .custom(rejectSuspiciousText),
  body('localGovernment')
    .trim()
    .notEmpty()
    .withMessage('Local Government is required.')
    .isLength({ max: 80 })
    .withMessage('Local Government is too long.')
    .custom(validateLocalGovernment)
    .custom(rejectSuspiciousText),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required.')
    .isLength({ min: 7, max: 20 })
    .withMessage('Phone number must be between 7 and 20 characters.')
    .matches(phoneRegex)
    .withMessage('Please provide a valid phone number.'),
  body('email')
    .trim()
    .normalizeEmail()
    .notEmpty()
    .withMessage('Email address is required for payment.')
    .isEmail()
    .withMessage('Please provide a valid email address.')
    .isLength({ max: 120 })
    .withMessage('Email address is too long.'),
  body('address')
    .trim()
    .notEmpty()
    .withMessage('Address or nearby location is required.')
    .isLength({ min: 5, max: 180 })
    .withMessage('Address must be between 5 and 180 characters.')
    .custom(rejectSuspiciousText),
  body('serviceDescription')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage('How you serve customers must be 1000 characters or fewer.')
    .custom(rejectSuspiciousText),
  body('yearsExperience')
    .trim()
    .notEmpty()
    .withMessage('Years of experience is required.')
    .custom(validateExperienceLength)
    .isInt({ min: 0, max: 80 })
    .withMessage('Years of experience must be a whole number between 0 and 80.'),
];

function handleValidationResult(req, res, next) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  const uploadedFiles = [
    req.file,
    ...Object.values(req.files || {}).flat(),
  ].filter(Boolean);

  uploadedFiles.forEach((file) => {
    if (file.path && /^https?:\/\//i.test(file.path)) {
      return;
    }

    const uploadedPath = path.join(__dirname, '..', '..', 'uploads', file.filename);
    if (fs.existsSync(uploadedPath)) {
      fs.unlinkSync(uploadedPath);
    }
  });

  return res.status(400).json({
    success: false,
    message: 'Please correct the highlighted form fields and try again.',
    errors: result.array().map((error) => ({
      field: error.path,
      message: error.msg,
    })),
  });
}

module.exports = {
  businessValidationRules,
  handleValidationResult,
};

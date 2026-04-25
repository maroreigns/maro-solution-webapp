const { body, validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const { businessCategories } = require('../data/categories');
const { nigeriaStatesAndLgas, nigeriaStates } = require('../data/nigeriaData');
const { sanitizeString } = require('../utils/sanitize');

const phoneRegex = /^\+?[0-9\s-]{7,20}$/;

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
    .withMessage('Name must be between 2 and 120 characters.'),
  body('category')
    .trim()
    .notEmpty()
    .withMessage('Service category is required.')
    .isIn(businessCategories)
    .withMessage('Please choose a valid service category.'),
  body('state')
    .trim()
    .notEmpty()
    .withMessage('State is required.')
    .isIn(nigeriaStates)
    .withMessage('Please choose a valid Nigerian state or FCT.'),
  body('localGovernment')
    .trim()
    .notEmpty()
    .withMessage('Local Government is required.')
    .custom(validateLocalGovernment),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required.')
    .matches(phoneRegex)
    .withMessage('Please provide a valid phone number.'),
  body('address')
    .trim()
    .notEmpty()
    .withMessage('Address or nearby location is required.')
    .isLength({ min: 5, max: 180 })
    .withMessage('Address must be between 5 and 180 characters.'),
  body('yearsExperience')
    .trim()
    .notEmpty()
    .withMessage('Years of experience is required.')
    .isInt({ min: 0, max: 80 })
    .withMessage('Years of experience must be a whole number between 0 and 80.'),
];

function handleValidationResult(req, res, next) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  if (req.file && !/^https?:\/\//i.test(req.file.path || '')) {
    const uploadedPath = path.join(__dirname, '..', '..', 'uploads', req.file.filename);
    if (fs.existsSync(uploadedPath)) {
      fs.unlinkSync(uploadedPath);
    }
  }

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

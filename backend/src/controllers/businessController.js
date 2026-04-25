const path = require('path');
const fs = require('fs');
const { Business } = require('../models/Business');
const { asyncHandler } = require('../utils/asyncHandler');
const { sanitizeString } = require('../utils/sanitize');

function buildImagePath(file) {
  if (!file) {
    return '';
  }

  return `/uploads/${file.filename}`;
}

function cleanupUploadedFile(filePath) {
  if (!filePath) {
    return;
  }

  const resolvedPath = path.join(__dirname, '..', '..', filePath.replace(/^\//, ''));
  if (fs.existsSync(resolvedPath)) {
    fs.unlinkSync(resolvedPath);
  }
}

function buildFilters(query) {
  const filters = {};
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

const getBusinesses = asyncHandler(async (req, res) => {
  const filters = buildFilters(req.query);
  const businesses = await Business.find(filters).sort({ createdAt: -1 });

  res.json({
    success: true,
    count: businesses.length,
    data: businesses,
  });
});

const getBusinessById = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);

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

const createBusiness = asyncHandler(async (req, res) => {
  const business = await Business.create({
    name: req.body.name,
    category: req.body.category,
    state: req.body.state,
    localGovernment: req.body.localGovernment,
    phone: req.body.phone,
    address: req.body.address,
    profileImage: buildImagePath(req.file),
    yearsExperience: Number(req.body.yearsExperience),
  });

  res.status(201).json({
    success: true,
    message: 'Business added successfully.',
    data: business,
  });
});

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

  if (req.file && business.profileImage) {
    cleanupUploadedFile(business.profileImage);
  }

  business.name = req.body.name;
  business.category = req.body.category;
  business.state = req.body.state;
  business.localGovernment = req.body.localGovernment;
  business.phone = req.body.phone;
  business.address = req.body.address;
  business.profileImage = newProfileImage;
  business.yearsExperience = Number(req.body.yearsExperience);

  await business.save();

  res.json({
    success: true,
    message: 'Business updated successfully.',
    data: business,
  });
});

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

  await business.deleteOne();

  res.json({
    success: true,
    message: 'Business deleted successfully.',
  });
});

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

module.exports = {
  createBusiness,
  deleteBusiness,
  getBusinessById,
  getBusinesses,
  rateBusiness,
  updateBusiness,
};

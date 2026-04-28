const path = require('path');
const fs = require('fs');
const { Business } = require('../models/Business');
const { asyncHandler } = require('../utils/asyncHandler');
const { sanitizeString } = require('../utils/sanitize');

function buildImagePath(file) {
  if (!file) {
    return '';
  }

  if (file.path) {
    return file.path;
  }

  return `/uploads/${file.filename}`;
}

function cleanupUploadedFile(filePath) {
  if (!filePath || /^https?:\/\//i.test(filePath)) {
    return;
  }

  const resolvedPath = path.join(__dirname, '..', '..', filePath.replace(/^\//, ''));
  if (fs.existsSync(resolvedPath)) {
    fs.unlinkSync(resolvedPath);
  }
}

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

const createBusiness = asyncHandler(async (req, res) => {
  const business = await Business.create({
    name: req.body.name,
    category: req.body.category,
    state: req.body.state,
    localGovernment: req.body.localGovernment,
    phone: req.body.phone,
    email: req.body.email,
    address: req.body.address,
    profileImage: buildImagePath(req.file),
    yearsExperience: Number(req.body.yearsExperience),
    status: 'pending',
    paymentStatus: 'unpaid',
  });

  res.status(201).json({
    success: true,
    message: 'Business submitted. Proceed to payment to complete your listing.',
    data: {
      _id: business._id,
      id: business._id,
      status: business.status,
      paymentStatus: business.paymentStatus,
    },
  });
});

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

async function updateApprovalState(req, res, updates, message) {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return res.status(404).json({
      success: false,
      message: 'Business not found.',
    });
  }

  Object.assign(business, updates);
  await business.save();

  return res.json({
    success: true,
    message,
    data: business,
  });
}

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

  business.status = 'approved';
  await business.save();

  return res.json({
    success: true,
    message: 'Business approved.',
    data: business,
  });
});

const rejectBusiness = asyncHandler(async (req, res) =>
  updateApprovalState(
    req,
    res,
    {
      status: 'rejected',
    },
    'Business rejected.'
  )
);

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
  business.email = req.body.email;
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
  approveBusiness,
  createBusiness,
  deleteBusiness,
  getBusinessById,
  getBusinesses,
  getPendingBusinesses,
  rateBusiness,
  rejectBusiness,
  rejectPayment,
  updateBusiness,
  verifyPayment,
};

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { Business } = require('../models/Business');
const { Report } = require('../models/Report');
const { asyncHandler } = require('../utils/asyncHandler');
const { escapeHtml, sendEmail } = require('../utils/email');
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

function getUploadedFile(req, fieldName) {
  if (req.file && req.file.fieldname === fieldName) {
    return req.file;
  }

  const files = req.files && req.files[fieldName];
  return Array.isArray(files) ? files[0] : null;
}

function getUploadedFiles(req, fieldName) {
  const files = req.files && req.files[fieldName];
  return Array.isArray(files) ? files : [];
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

function getOwnerStatusMessage(business) {
  if (business.status === 'approved' && business.paymentStatus === 'verified') {
    return 'Congratulations! Your business listing has been approved and is now live on Maro Services Hub.';
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

const createBusiness = asyncHandler(async (req, res) => {
  const profileImage = getUploadedFile(req, 'profileImage');
  const serviceImages = getUploadedFiles(req, 'serviceImages').map(buildImagePath);

  const business = await Business.create({
    name: req.body.name,
    category: req.body.category,
    state: req.body.state,
    localGovernment: req.body.localGovernment,
    phone: req.body.phone,
    email: req.body.email,
    address: req.body.address,
    profileImage: buildImagePath(profileImage),
    serviceDescription: sanitizeString(req.body.serviceDescription) || '',
    serviceImages,
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

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

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
    onUpdated(business, { previousStatus });
  }

  return res.json({
    success: true,
    message,
    data: business,
  });
}

function sendApprovalEmail(business) {
  if (!business.email) {
    return;
  }

  const businessName = business.name || 'there';
  const text = `Hello ${businessName},

Congratulations! Your business listing has been approved and is now live on Maro Services Hub.
Customers can now find your business and contact you directly through WhatsApp or phone.`;

  sendEmail({
    to: business.email,
    subject: 'Your listing is now live on Maro Services Hub',
    text,
    html: `<p>Hello ${escapeHtml(businessName)},</p>
<p>Congratulations! Your business listing has been approved and is now live on Maro Services Hub.</p>
<p>Customers can now find your business and contact you directly through WhatsApp or phone.</p>`,
  });
}

function sendRejectionEmail(business, state = {}) {
  if (!business.email || state.previousStatus === 'rejected') {
    return;
  }

  const businessName = business.name || 'there';
  const text = `Hello ${businessName},

Your business listing was not approved at this time.
Please contact Maro Services Hub support for more information.`;

  sendEmail({
    to: business.email,
    subject: 'Update on your Maro Services Hub listing',
    text,
    html: `<p>Hello ${escapeHtml(businessName)},</p>
<p>Your business listing was not approved at this time.</p>
<p>Please contact Maro Services Hub support for more information.</p>`,
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

  const previousStatus = business.status;
  business.status = 'approved';
  await business.save();

  if (previousStatus !== 'approved') {
    sendApprovalEmail(business);
  }

  return res.json({
    success: true,
    message: 'Business approved.',
    data: business,
  });
});

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

  await Report.deleteMany({ businessId: business._id });
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

  if (process.env.ADMIN_NOTIFICATION_EMAIL) {
    const text = `New business report submitted

Business name: ${business.name || ''}
Report reason: ${reason}
Report message: ${message || ''}
Reporter name: ${reporterName || 'Not provided'}
Reporter contact: ${reporterContact || 'Not provided'}`;

    sendEmail({
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
  }

  res.status(201).json({
    success: true,
    message: 'Report submitted. Thank you for helping keep Maro Services Hub trusted.',
    data: report,
  });
});

module.exports = {
  addBusinessComment,
  approveBusiness,
  createBusiness,
  deleteBusiness,
  deleteBusinessReport,
  getBusinessById,
  getBusinessOwnerStatus,
  getBusinessReports,
  getBusinesses,
  getPendingBusinesses,
  rateBusiness,
  reportBusiness,
  resolveBusinessReport,
  rejectBusiness,
  rejectPayment,
  updateBusiness,
  verifyBusinessPhone,
  verifyPayment,
};

const { Business } = require('../models/Business');
const { asyncHandler } = require('../utils/asyncHandler');
const { sanitizeString } = require('../utils/sanitize');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const PAYSTACK_CALLBACK_URL = 'https://marosolutionapp.com/listings.html?payment=success';

function getPaystackSecretKey() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    const error = new Error('Paystack is not configured.');
    error.statusCode = 500;
    error.publicMessage = 'Payment is not configured yet. Please contact admin.';
    throw error;
  }

  return secretKey;
}

function getListingFeeKobo() {
  const listingFeeNaira = Number(process.env.LISTING_FEE_NAIRA || 1000);
  return Math.round(listingFeeNaira * 100);
}

async function callPaystack(path, options = {}) {
  const response = await fetch(PAYSTACK_BASE_URL + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${getPaystackSecretKey()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.status === false) {
    const error = new Error(payload.message || 'Paystack request failed.');
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    error.publicMessage = payload.message || 'Unable to process payment right now.';
    throw error;
  }

  return payload.data || {};
}

async function findBusinessForVerifiedPayment(paystackData) {
  const reference = sanitizeString(paystackData.reference || '');
  const metadataBusinessId = sanitizeString(
    paystackData.metadata && paystackData.metadata.businessId
  );

  let business = reference ? await Business.findOne({ paymentReference: reference }) : null;

  if (!business && metadataBusinessId) {
    business = await Business.findById(metadataBusinessId);
  }

  return business;
}

async function verifyAndSavePayment(reference) {
  const cleanReference = sanitizeString(reference || '');

  if (!cleanReference) {
    const error = new Error('Payment reference is required.');
    error.statusCode = 400;
    error.publicMessage = 'Payment reference is required.';
    throw error;
  }

  const expectedAmountKobo = getListingFeeKobo();

  const paystackData = await callPaystack(
    `/transaction/verify/${encodeURIComponent(cleanReference)}`,
    {
      method: 'GET',
    }
  );

  if (paystackData.status !== 'success') {
    const error = new Error('Paystack payment was not successful.');
    error.statusCode = 400;
    error.publicMessage = 'Payment could not be verified.';
    throw error;
  }

  if (Number(paystackData.amount) !== expectedAmountKobo) {
    const error = new Error('Paystack payment amount mismatch.');
    error.statusCode = 400;
    error.publicMessage = 'Payment amount does not match the listing fee.';
    throw error;
  }

  const business = await findBusinessForVerifiedPayment(paystackData);

  if (!business) {
    const error = new Error('Business not found for payment reference.');
    error.statusCode = 404;
    error.publicMessage = 'Business not found for this payment reference.';
    throw error;
  }

  business.paymentStatus = 'verified';
  business.paymentReference = cleanReference;
  business.amountPaid = Number(paystackData.amount) / 100;
  business.paidAt = new Date();

  if (business.status !== 'approved') {
    business.status = 'pending';
  }

  await business.save();

  return business;
}

const initializePayment = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.businessId);

  if (!business) {
    return res.status(404).json({
      success: false,
      message: 'Business not found.',
    });
  }

  const providerEmail = String(sanitizeString(business.email || req.body.email || ''))
    .trim()
    .toLowerCase();

  if (!providerEmail) {
    return res.status(400).json({
      success: false,
      message: 'Provider email is required before payment can be initialized.',
    });
  }

  const paystackData = await callPaystack('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: providerEmail,
      amount: getListingFeeKobo(),
      callback_url: PAYSTACK_CALLBACK_URL,
      metadata: {
        businessId: String(business._id),
        businessName: business.name,
      },
    }),
  });

  business.email = providerEmail;
  business.paymentReference = paystackData.reference || business.paymentReference;
  business.paystackAccessCode = paystackData.access_code || '';
  business.paystackAuthorizationUrl = paystackData.authorization_url || '';
  business.paymentStatus = 'initialized';

  await business.save();

  res.json({
    success: true,
    message: 'Payment initialized.',
    authorization_url: business.paystackAuthorizationUrl,
  });
});

const verifyPaystackReference = asyncHandler(async (req, res) => {
  const business = await verifyAndSavePayment(req.body.reference);

  res.json({
    success: true,
    message: 'Payment verified. Your listing is pending admin approval.',
    data: business,
  });
});

module.exports = {
  initializePayment,
  verifyAndSavePayment,
  verifyPaystackReference,
};
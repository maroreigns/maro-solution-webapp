/**
 * Payment Controller
 *
 * Handles Paystack payment initialization, verification, listing payment state,
 * and payment confirmation email notifications.
 */
const crypto = require('crypto');
const { Business } = require('../models/Business');
const { asyncHandler } = require('../utils/asyncHandler');
const { escapeHtml, sendEmail } = require('../utils/email');
const { sanitizeString } = require('../utils/sanitize');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const PAYSTACK_CALLBACK_BASE_URL = 'https://marosolutionapp.com/listings.html';

/**
 * Read the Paystack secret key or raise a public configuration error.
 *
 * @returns {string} Paystack secret key.
 * @sideeffects Throws when payment is not configured.
 */
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

/**
 * Convert configured listing fee from naira to kobo.
 *
 * @returns {number} Listing fee in kobo.
 * @sideeffects Reads LISTING_FEE_NAIRA from the environment.
 */
function getListingFeeKobo() {
  const configuredListingFee = Number(process.env.LISTING_FEE_NAIRA);
  const listingFeeNaira =
    Number.isFinite(configuredListingFee) && configuredListingFee > 0
      ? configuredListingFee
      : 1000;

  return Math.round(listingFeeNaira * 100);
}

/**
 * Create a unique Paystack reference for a listing payment.
 *
 * @param {string|ObjectId} businessId Business identifier.
 * @returns {string} Payment reference.
 * @sideeffects Uses random bytes and the current timestamp.
 */
function createPaymentReference(businessId) {
  const suffix = crypto.randomBytes(6).toString('hex');
  return `maro_${businessId}_${Date.now()}_${suffix}`;
}

/**
 * Build the public payment return URL used by Paystack.
 *
 * @param {string} reference Paystack transaction reference.
 * @returns {string} Callback URL containing payment query parameters.
 * @sideeffects None.
 */
function buildCallbackUrl(reference) {
  const callbackUrl = new URL(PAYSTACK_CALLBACK_BASE_URL);
  callbackUrl.searchParams.set('payment', 'success');
  callbackUrl.searchParams.set('reference', reference);
  return callbackUrl.toString();
}

/**
 * Call the Paystack API with shared authorization and error handling.
 *
 * @param {string} path Paystack API path.
 * @param {Object} options Fetch options.
 * @returns {Promise<Object>} Paystack response data.
 * @sideeffects Performs a network request to Paystack.
 */
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

/**
 * Locate the business attached to a verified Paystack transaction.
 *
 * @param {Object} paystackData Verified Paystack transaction data.
 * @returns {Promise<Object|null>} Matching Business document.
 * @sideeffects Queries MongoDB.
 */
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

/**
 * Verify a Paystack reference and persist successful payment details.
 *
 * @param {string} reference Paystack transaction reference.
 * @returns {Promise<Object>} Updated Business document.
 * @sideeffects Calls Paystack, updates listing payment fields, and may send email.
 */
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

  const wasPaymentVerified = business.paymentStatus === 'verified';

  business.paymentStatus = 'verified';
  business.paymentReference = cleanReference;
  business.amountPaid = Number(paystackData.amount) / 100;
  business.paidAt = new Date();

  if (business.status !== 'approved') {
    business.status = 'pending';
  }

  await business.save();

  console.log(`[email-hook] payment verification reached for ${business._id}.`);

  if (!wasPaymentVerified && business.email) {
    const businessName = business.name || 'there';
    const text = `Hello ${businessName},

Your listing payment has been confirmed.
Your business listing is now waiting for admin review and approval.
We will notify you once your listing is approved.`;

    await sendEmail({
      to: business.email,
      subject: 'Payment confirmed - Maro Services Hub',
      text,
      html: `<p>Hello ${escapeHtml(businessName)},</p>
<p>Your listing payment has been confirmed.</p>
<p>Your business listing is now waiting for admin review and approval.</p>
<p>We will notify you once your listing is approved.</p>`,
    });
  } else if (wasPaymentVerified) {
    console.warn(`[email-hook] payment verification skipped for ${business._id}: already verified.`);
  } else {
    console.warn(`[email-hook] payment verification skipped for ${business._id}: business email is missing.`);
  }

  return business;
}

/**
 * Initialize Paystack payment for a submitted business listing.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Creates Paystack transaction and stores reference/access data.
 */
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

  const paymentReference = createPaymentReference(business._id);

  const paystackData = await callPaystack('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: providerEmail,
      amount: getListingFeeKobo(),
      reference: paymentReference,
      callback_url: buildCallbackUrl(paymentReference),
      metadata: {
        businessId: String(business._id),
        businessName: business.name,
      },
    }),
  });

  business.email = providerEmail;
  business.paymentReference = paystackData.reference || paymentReference;
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

/**
 * Verify a Paystack reference submitted by the frontend.
 *
 * @param {Request} req
 * @param {Response} res
 * @returns {Promise<void>}
 * @sideeffects Delegates payment verification and returns updated business data.
 */
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

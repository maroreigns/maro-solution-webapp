/**
 * Email Utility
 *
 * Centralizes Resend client creation, HTML escaping, and transactional email
 * sending for payment, approval, rejection, report, and password flows.
 */
const { Resend } = require('resend');

let resend = null;
let resendApiKey = '';

/**
 * Lazily create or reuse a Resend client for the current API key.
 *
 * @returns {Resend|null} Configured Resend client, or null when missing config.
 * @sideeffects Caches the client instance for reuse.
 */
function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return null;
  }

  if (!resend || resendApiKey !== apiKey) {
    resend = new Resend(apiKey);
    resendApiKey = apiKey;
  }

  return resend;
}

/**
 * Escape text before inserting it into email HTML.
 *
 * @param {*} value Value to escape.
 * @returns {string} HTML-safe string.
 * @sideeffects None.
 */
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Send a transactional email when Resend is configured.
 *
 * @param {Object} options
 * @param {string} options.to Recipient email address.
 * @param {string} options.subject Email subject line.
 * @param {string} options.text Plain text email body.
 * @param {string} options.html HTML email body.
 * @returns {Promise<boolean>} True when sent, false when skipped or failed.
 * @sideeffects Sends email through Resend and writes diagnostic logs.
 */
async function sendEmail({ to, subject, text, html }) {
  const from = process.env.RESEND_FROM_EMAIL;

  if (!to) {
    console.warn(`[email] Skipped "${subject || 'email'}": recipient is missing.`);
    return false;
  }

  if (!process.env.RESEND_API_KEY || !from) {
    console.warn(
      `[email] Skipped "${subject || 'email'}" to ${to}: RESEND_API_KEY or RESEND_FROM_EMAIL is missing.`
    );
    return false;
  }

  console.log(`[email] Attempting "${subject || 'email'}" to ${to}.`);

  try {
    const client = getResendClient();

    if (!client) {
      console.warn(`[email] Skipped "${subject || 'email'}" to ${to}: Resend client is unavailable.`);
      return false;
    }

    await client.emails.send({
      from,
      to,
      subject,
      text,
      html,
    });
    console.log(`[email] Sent "${subject || 'email'}" to ${to}.`);
    return true;
  } catch (error) {
    console.warn(`[email] Failed "${subject || 'email'}" to ${to}:`, error.message);
    return false;
  }
}

module.exports = {
  escapeHtml,
  sendEmail,
};

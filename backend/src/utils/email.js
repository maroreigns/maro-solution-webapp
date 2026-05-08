const { Resend } = require('resend');

let resend = null;
let resendApiKey = '';

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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

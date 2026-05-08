const { Resend } = require('resend');

let resend = null;

if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
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
    console.warn('[email] Skipping email: recipient is missing.');
    return;
  }

  if (!resend || !from) {
    console.warn('[email] Skipping email: RESEND_API_KEY or RESEND_FROM_EMAIL is missing.');
    return;
  }

  try {
    await resend.emails.send({
      from,
      to,
      subject,
      text,
      html,
    });
  } catch (error) {
    console.warn('[email] Failed to send email:', error.message);
  }
}

module.exports = {
  escapeHtml,
  sendEmail,
};

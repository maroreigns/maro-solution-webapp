function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^0[789][01]\d{8}$/.test(digits)) return `234${digits.slice(1)}`;
  if (/^234[789][01]\d{8}$/.test(digits)) return digits;
  return digits;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function emailLookup(value) {
  const email = normalizeEmail(value);
  return email ? { $regex: new RegExp(`^\\s*${escapeRegex(email)}\\s*$`, 'i') } : null;
}

function phoneLookup(value) {
  const phone = normalizePhone(value);
  if (!phone) return null;
  const local = phone.startsWith('234') && phone.length === 13 ? `0${phone.slice(3)}` : phone;
  const international = phone.startsWith('234') && phone.length === 13 ? phone : null;
  const patterns = [local, international]
    .filter(Boolean)
    .map((digits) => digits.split('').map(escapeRegex).join('\\D*'));
  return { $regex: new RegExp(`^\\D*(?:${patterns.join('|')})\\D*$`) };
}

module.exports = { emailLookup, normalizeEmail, normalizePhone, phoneLookup };

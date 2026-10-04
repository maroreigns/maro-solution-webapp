const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const TARGET_EMAIL = 'maroadonis@yahoo.com';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^0[789][01]\d{8}$/.test(digits)) return `234${digits.slice(1)}`;
  if (/^234[789][01]\d{8}$/.test(digits)) return digits;
  return digits;
}

function maskEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return '[none]';
  if (!email.includes('@')) return '[invalid/masked]';
  const [local, domain] = email.split('@');
  const domainParts = domain.split('.');
  const host = domainParts.shift() || '';
  return `${local.slice(0, 2)}${'*'.repeat(Math.min(6, Math.max(1, local.length - 2)))}@` +
    `${host.slice(0, 1)}${'*'.repeat(Math.min(5, Math.max(1, host.length - 1)))}.` +
    domainParts.join('.');
}

function maskPhone(value) {
  const phone = normalizePhone(value);
  if (!phone) return '[none]';
  return `${phone.slice(0, 3)}******${phone.slice(-4)}`;
}

function safeBusiness(document) {
  return {
    id: String(document._id),
    name: document.name || '[none]',
    email: maskEmail(document.email),
    phone: maskPhone(document.phone),
    hasPasswordHash: Boolean(document.passwordHash),
    hasOwnerId: Boolean(document.ownerId),
    hasGoogleId: Boolean(document.googleId),
    hasOwnerEmailKey: Boolean(document.ownerEmailKey),
    hasOwnerPhoneKey: Boolean(document.ownerPhoneKey),
    createdAt: document.createdAt || null,
  };
}

function safeOwner(document) {
  return {
    id: String(document._id),
    name: document.name || '[none]',
    email: maskEmail(document.email),
    phone: maskPhone(document.phone),
    authProvider: document.authProvider || '[none]',
    hasGoogleId: Boolean(document.googleId),
    hasBusinessId: Boolean(document.businessId),
  };
}

function duplicateGroups(documents, getKey, serialize) {
  const groups = new Map();
  for (const document of documents) {
    const key = getKey(document);
    if (!key) continue;
    const records = groups.get(key) || [];
    records.push(document);
    groups.set(key, records);
  }
  return [...groups.entries()]
    .filter(([, records]) => records.length > 1)
    .map(([key, records]) => ({
      normalizedIdentity: key.includes('@') ? maskEmail(key) : maskPhone(key),
      count: records.length,
      records: records.map(serialize),
    }));
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured.');

  // Disable automatic collection/index creation so this audit remains read-only.
  await mongoose.connect(process.env.MONGODB_URI, {
    autoIndex: false,
    autoCreate: false,
  });

  const businesses = await mongoose.connection.collection('businesses').find({}, {
    projection: {
      name: 1,
      email: 1,
      phone: 1,
      passwordHash: 1,
      ownerId: 1,
      googleId: 1,
      ownerEmailKey: 1,
      ownerPhoneKey: 1,
      createdAt: 1,
    },
  }).toArray();

  const owners = await mongoose.connection.collection('owners').find({}, {
    projection: {
      name: 1,
      email: 1,
      phone: 1,
      authProvider: 1,
      googleId: 1,
      businessId: 1,
    },
  }).toArray();

  const targetBusinesses = businesses.filter(
    (business) => normalizeEmail(business.email) === TARGET_EMAIL
  );
  const targetOwners = owners.filter((owner) => normalizeEmail(owner.email) === TARGET_EMAIL);
  const targetNames = new Set(
    targetBusinesses.map((business) => String(business.name || '').trim().toLowerCase()).filter(Boolean)
  );
  const targetPhones = new Set(
    targetBusinesses.map((business) => normalizePhone(business.phone)).filter(Boolean)
  );
  const targetIds = new Set(targetBusinesses.map((business) => String(business._id)));
  const relatedBusinesses = businesses.filter((business) => {
    if (targetIds.has(String(business._id))) return false;
    const sameName = targetNames.has(String(business.name || '').trim().toLowerCase());
    const samePhone = targetPhones.has(normalizePhone(business.phone));
    return sameName || samePhone;
  });

  const report = {
    targetEmailExistsInBusiness: targetBusinesses.length > 0,
    targetEmailExistsInOwner: targetOwners.length > 0,
    targetBusinessMatches: targetBusinesses.map(safeBusiness),
    targetOwnerMatches: targetOwners.map(safeOwner),
    relatedBusinessesByExactNormalizedNameOrPhone: relatedBusinesses.map(safeBusiness),
    counts: {
      businesses: businesses.length,
      owners: owners.length,
      passwordBusinesses: businesses.filter((business) => Boolean(business.passwordHash)).length,
      googleOrOwnerLinkedBusinesses: businesses.filter(
        (business) => Boolean(business.googleId || business.ownerId)
      ).length,
    },
    passwordBusinessesUnderOtherEmails: businesses
      .filter((business) => Boolean(business.passwordHash))
      .map(safeBusiness),
    passwordBusinessesMissingEmail: businesses
      .filter((business) => Boolean(business.passwordHash) && !normalizeEmail(business.email))
      .map(safeBusiness),
    businessesMissingEmail: businesses
      .filter((business) => !normalizeEmail(business.email))
      .map(safeBusiness),
    duplicateBusinessEmails: duplicateGroups(businesses, (item) => normalizeEmail(item.email), safeBusiness),
    duplicateBusinessPhones: duplicateGroups(businesses, (item) => normalizePhone(item.phone), safeBusiness),
    duplicateOwnerEmails: duplicateGroups(owners, (item) => normalizeEmail(item.email), safeOwner),
    duplicateOwnerPhones: duplicateGroups(owners, (item) => normalizePhone(item.phone), safeOwner),
  };

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`Audit failed: ${error.message}`);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exitCode = 1;
});

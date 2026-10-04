const assert = require('node:assert/strict');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

process.env.OWNER_JWT_SECRET = process.env.OWNER_JWT_SECRET || 'test-owner-secret-with-sufficient-length';

let deliveredCode = '';
const emailUtility = require('../src/utils/email');
emailUtility.sendEmail = async (message) => {
  const match = String(message.text || '').match(/reset code is: (\d{6})/);
  deliveredCode = match ? match[1] : '';
  return true;
};

const { Business } = require('../src/models/Business');
const { Owner } = require('../src/models/Owner');
const {
  createBusiness,
  forgotOwnerPassword,
  loginBusinessOwner,
  resetOwnerPassword,
  verifyOwnerResetCode,
} = require('../src/controllers/businessController');
const { googleOwnerLogin } = require('../src/controllers/ownerAuthController');
const { requireOwnerAuth } = require('../src/middleware/ownerAuth');
const { normalizeEmail, normalizePhone, phoneLookup } = require('../src/utils/identity');
const { OAuth2Client } = require('google-auth-library');

function invoke(handler, body, requestFields = {}) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ status: this.statusCode, payload });
      },
    };
    handler({ body, get: () => '', ...requestFields }, response, reject);
  });
}

function selected(value) {
  return { select: async () => value };
}

function selectedOwner(value) {
  return { select: () => Promise.resolve(value) };
}

function businessList(value) {
  return { select() { return this; }, limit: async () => value };
}

function createBusinessDocument() {
  return {
    _id: '507f1f77bcf86cd799439011',
    name: 'Existing VOMA Business',
    email: 'owner@example.com',
    passwordHash: '',
    async save() {},
    toJSON() {
      return { _id: this._id, name: this.name, email: this.email };
    },
  };
}

function registrationBody(overrides = {}) {
  return {
    name: 'New Business',
    category: 'Plumbing',
    state: 'Lagos',
    localGovernment: 'Ikeja',
    phone: '08012345678',
    email: 'new@example.com',
    address: '1 Example Street',
    yearsExperience: '5',
    password: 'Secure-password-123',
    confirmPassword: 'Secure-password-123',
    ...overrides,
  };
}

test('email and Nigerian phone identities normalize consistently', () => {
  assert.equal(normalizeEmail(' Test@Email.com '), 'test@email.com');
  assert.equal(normalizePhone('08012345678'), '2348012345678');
  assert.equal(normalizePhone('+234 801 234 5678'), '2348012345678');
  assert.equal(normalizePhone('2348012345678'), '2348012345678');
  assert.equal(phoneLookup('+2348012345678').$regex.test('0801-234-5678'), true);
});

test('registration rejects an existing normalized email', async () => {
  const originalOwnerExists = Owner.exists;
  const originalOwnerCreate = Owner.create;
  const originalBusinessCreate = Business.create;
  let createCount = 0;
  try {
    Owner.exists = async (query) => query.emailKey ? { _id: 'existing-owner' } : null;
    Owner.create = async () => { createCount += 1; };
    Business.create = async () => { createCount += 1; };
    const result = await invoke(createBusiness, registrationBody({ email: ' EXISTING@Example.com ' }));
    assert.equal(result.status, 409);
    assert.equal(result.payload.message, 'An account already exists with this email address.');
    assert.equal(createCount, 0);
  } finally {
    Owner.exists = originalOwnerExists;
    Owner.create = originalOwnerCreate;
    Business.create = originalBusinessCreate;
  }
});

test('registration rejects an equivalent Nigerian phone format', async () => {
  const originalOwnerExists = Owner.exists;
  const originalOwnerCreate = Owner.create;
  const originalBusinessCreate = Business.create;
  try {
    Owner.exists = async (query) => query.phoneKey ? { _id: 'existing-owner' } : null;
    Owner.create = async () => { throw new Error('should not create'); };
    Business.create = async () => { throw new Error('should not create'); };
    const result = await invoke(createBusiness, registrationBody({ phone: '+2348012345678' }));
    assert.equal(result.status, 409);
    assert.equal(result.payload.message, 'An account already exists with this phone number.');
  } finally {
    Owner.exists = originalOwnerExists;
    Owner.create = originalOwnerCreate;
    Business.create = originalBusinessCreate;
  }
});

test('Owner identity indexes are unique while Business contact fields are not', () => {
  const ownerIndexes = Owner.schema.indexes();
  assert.ok(ownerIndexes.some(([keys, options]) => keys.emailKey === 1 && options.unique));
  assert.ok(ownerIndexes.some(([keys, options]) => keys.phoneKey === 1 && options.unique && options.sparse));
  const businessIndexes = Business.schema.indexes();
  assert.equal(businessIndexes.some(([keys, options]) => (keys.email || keys.phone) && options.unique), false);
});

test('password Owner validates without googleId', () => {
  const owner = new Owner({
    email: 'password@example.com',
    emailKey: 'password@example.com',
    phone: '08012345678',
    phoneKey: '2348012345678',
    passwordHash: 'hashed-value',
    authProvider: 'password',
  });
  assert.equal(owner.googleId, undefined);
  assert.equal(owner.validateSync(), undefined);
});

test('Google Owner validates without passwordHash', () => {
  const owner = new Owner({
    email: 'google@example.com',
    emailKey: 'google@example.com',
    googleId: 'google-subject',
    authProvider: 'google',
  });
  assert.equal(owner.passwordHash, undefined);
  assert.equal(owner.validateSync(), undefined);
});

test('a duplicate Business contact email does not block a new Owner account', async () => {
  const originals = { ownerExists: Owner.exists, ownerCreate: Owner.create, businessCreate: Business.create };
  let createdBusiness;
  try {
    Owner.exists = async () => null;
    Owner.create = async (values) => ({
      _id: '507f191e810c19729de860ea', ...values, businessId: null, async save() {},
    });
    Business.create = async (values) => {
      createdBusiness = { _id: '507f1f77bcf86cd799439011', ...values };
      return createdBusiness;
    };
    const result = await invoke(createBusiness, registrationBody({ email: 'shared-contact@example.com' }));
    assert.equal(result.status, 201);
    assert.equal(createdBusiness.email, 'shared-contact@example.com');
    assert.ok(createdBusiness.ownerId);
    assert.ok(result.payload.token);
  } finally {
    Owner.exists = originals.ownerExists;
    Owner.create = originals.ownerCreate;
    Business.create = originals.businessCreate;
  }
});

test('a duplicate Business contact phone does not become an Owner uniqueness check', async () => {
  const originals = { ownerExists: Owner.exists, ownerCreate: Owner.create, businessCreate: Business.create };
  const checkedQueries = [];
  try {
    Owner.exists = async (query) => { checkedQueries.push(query); return null; };
    Owner.create = async (values) => ({
      _id: '507f191e810c19729de860ea', ...values, businessId: null, async save() {},
    });
    Business.create = async (values) => ({ _id: '507f1f77bcf86cd799439011', ...values });
    const result = await invoke(createBusiness, registrationBody({ phone: '+2348012345678' }));
    assert.equal(result.status, 201);
    assert.deepEqual(checkedQueries.map((query) => Object.keys(query)[0]), ['emailKey', 'phoneKey']);
  } finally {
    Owner.exists = originals.ownerExists;
    Owner.create = originals.ownerCreate;
    Business.create = originals.businessCreate;
  }
});

test('new password credentials are stored on Owner rather than Business', async () => {
  const originals = { ownerExists: Owner.exists, ownerCreate: Owner.create, businessCreate: Business.create };
  let ownerValues;
  let businessValues;
  try {
    Owner.exists = async () => null;
    Owner.create = async (values) => {
      ownerValues = values;
      return { _id: '507f191e810c19729de860ea', ...values, businessId: null, async save() {} };
    };
    Business.create = async (values) => {
      businessValues = values;
      return { _id: '507f1f77bcf86cd799439011', ...values };
    };
    await invoke(createBusiness, registrationBody());
    assert.ok(ownerValues.passwordHash);
    assert.equal(ownerValues.googleId, undefined);
    assert.equal(businessValues.passwordHash, undefined);
  } finally {
    Owner.exists = originals.ownerExists;
    Owner.create = originals.ownerCreate;
    Business.create = originals.businessCreate;
  }
});

test('an authenticated Google Owner can add a Business without another password', async () => {
  const originalBusinessCreate = Business.create;
  const owner = {
    _id: '507f191e810c19729de860ea', businessId: null, authProvider: 'google', async save() {},
  };
  try {
    Business.create = async (values) => ({ _id: '507f1f77bcf86cd799439011', ...values });
    const body = registrationBody({ password: '', confirmPassword: '' });
    const result = await invoke(createBusiness, body, { ownerAccount: owner });
    assert.equal(result.status, 201);
    assert.equal(String(result.payload.data._id), '507f1f77bcf86cd799439011');
    assert.ok(result.payload.token);
  } finally {
    Business.create = originalBusinessCreate;
  }
});

test('non-Nigerian phone normalization preserves the full international digits', () => {
  assert.equal(normalizePhone('+1 (415) 555-0123'), '14155550123');
});

test('password reset rejects malformed and unknown email addresses', async () => {
  const originalOwnerFindOne = Owner.findOne;
  const originalFindOne = Business.findOne;
  const originalBusinessExists = Business.exists;
  const originalOwnerExists = Owner.exists;
  try {
    let result = await invoke(forgotOwnerPassword, { email: 'not-an-email' });
    assert.equal(result.status, 400);
    assert.equal(result.payload.message, 'Please enter a valid email address.');

    Business.findOne = () => selected(null);
    Business.exists = async () => false;
    Owner.findOne = () => selected(null);
    Owner.exists = async () => false;
    result = await invoke(forgotOwnerPassword, { email: 'missing@example.com' });
    assert.equal(result.status, 404);
    assert.equal(result.payload.message, 'No account was found with this email address.');
  } finally {
    Business.findOne = originalFindOne;
    Owner.findOne = originalOwnerFindOne;
    Business.exists = originalBusinessExists;
    Owner.exists = originalOwnerExists;
  }
});

test('password reset directs a Google-only owner back to Google Sign-In', async () => {
  const originalOwnerFindOne = Owner.findOne;
  const originalFindOne = Business.findOne;
  try {
    Business.findOne = () => selected(null);
    Owner.findOne = (query) => selected(query.passwordHash ? null : { authProvider: 'google' });
    const result = await invoke(forgotOwnerPassword, { email: ' Google.Owner@Example.com ' });
    assert.equal(result.status, 400);
    assert.equal(result.payload.message, 'This account uses Google Sign-In. Please continue with Google.');
  } finally {
    Owner.findOne = originalOwnerFindOne;
    Business.findOne = originalFindOne;
  }
});

test('password reset identifies a listing-only contact email', async () => {
  const originals = { ownerFindOne: Owner.findOne, businessFindOne: Business.findOne, businessExists: Business.exists };
  try {
    Owner.findOne = () => selected(null);
    Business.findOne = () => selected(null);
    Business.exists = async () => true;
    const result = await invoke(forgotOwnerPassword, { email: 'legacy-listing@example.com' });
    assert.equal(result.status, 409);
    assert.equal(
      result.payload.message,
      'This email is attached to a business listing, but no password login account has been created for it yet.'
    );
  } finally {
    Owner.findOne = originals.ownerFindOne;
    Business.findOne = originals.businessFindOne;
    Business.exists = originals.businessExists;
  }
});

test('password reset locks a code after the configured attempt limit', async () => {
  const originalOwnerFindOne = Owner.findOne;
  const originalBusinessFindOne = Business.findOne;
  const account = createBusinessDocument();
  account.passwordResetCodeHash = await bcrypt.hash('123456', 4);
  account.passwordResetExpires = new Date(Date.now() + 60_000);
  account.passwordResetAttempts = 4;
  Owner.findOne = () => selected(account);
  Business.findOne = () => selected(null);
  try {
    const result = await invoke(verifyOwnerResetCode, { email: account.email, code: '654321' });
    assert.equal(result.status, 400);
    assert.equal(account.passwordResetCodeHash, undefined);
    assert.equal(account.passwordResetAttempts, 0);
  } finally {
    Owner.findOne = originalOwnerFindOne;
    Business.findOne = originalBusinessFindOne;
  }
});

test('password reset code is hashed, expires, is attempt-limited, and is single-use', async () => {
  const originalOwnerFindOne = Owner.findOne;
  const originalFindOne = Business.findOne;
  const business = createBusinessDocument();
  const oldPassword = 'Old-password-123';
  const newPassword = 'New-password-456';
  business.passwordHash = await bcrypt.hash(oldPassword, 4);
  Owner.findOne = () => selected(business);
  Business.findOne = () => selected(null);

  try {
    const forgotResult = await invoke(forgotOwnerPassword, { email: ' Owner@Example.com ' });
    assert.equal(forgotResult.status, 200);
    assert.equal(forgotResult.payload.message, 'Password reset code sent. Check your email to continue.');
    assert.match(deliveredCode, /^\d{6}$/);
    assert.notEqual(business.passwordResetCodeHash, deliveredCode);
    assert.equal(await bcrypt.compare(deliveredCode, business.passwordResetCodeHash), true);

    let result = await invoke(verifyOwnerResetCode, {
      email: 'owner@example.com',
      code: deliveredCode === '000000' ? '000001' : '000000',
    });
    assert.equal(result.status, 400);
    assert.equal(result.payload.message, 'The reset code is incorrect.');

    const validHash = business.passwordResetCodeHash;
    business.passwordResetExpires = new Date(Date.now() - 1);
    result = await invoke(verifyOwnerResetCode, { email: 'owner@example.com', code: deliveredCode });
    assert.equal(result.status, 400);
    assert.equal(result.payload.message, 'This reset code has expired. Request a new one.');

    business.passwordResetCodeHash = validHash;
    business.passwordResetExpires = new Date(Date.now() + 60_000);
    result = await invoke(verifyOwnerResetCode, { email: 'owner@example.com', code: deliveredCode });
    assert.equal(result.status, 200);
    assert.ok(result.payload.resetToken);
    const resetToken = result.payload.resetToken;

    result = await invoke(resetOwnerPassword, {
      email: 'owner@example.com',
      resetToken,
      newPassword,
      confirmPassword: newPassword,
    });
    assert.equal(result.status, 200);
    assert.equal(result.payload.message, 'Password reset successful. You can now log in with your new password.');
    assert.equal(await bcrypt.compare(newPassword, business.passwordHash), true);
    assert.equal(await bcrypt.compare(oldPassword, business.passwordHash), false);
    assert.equal(business.passwordResetTokenHash, undefined);

    result = await invoke(resetOwnerPassword, {
      email: 'owner@example.com',
      resetToken,
      newPassword: 'Another-password-789',
      confirmPassword: 'Another-password-789',
    });
    assert.equal(result.status, 400);
    assert.equal(business.name, 'Existing VOMA Business');
  } finally {
    Owner.findOne = originalOwnerFindOne;
    Business.findOne = originalFindOne;
  }
});

test('login accepts the new password and rejects the old password', async () => {
  const originalOwnerFindOne = Owner.findOne;
  const originalBusinessFind = Business.find;
  const originalFindById = Business.findById;
  const originalSecret = process.env.OWNER_JWT_SECRET;
  const business = createBusinessDocument();
  const owner = {
    _id: '507f191e810c19729de860ea',
    businessId: business._id,
    passwordHash: await bcrypt.hash('New-password-456', 4),
    async save() {},
  };
  Owner.findOne = () => selected(owner);
  Business.find = () => ({ select() { return this; }, limit: async () => [] });
  Business.findById = async () => business;
  process.env.OWNER_JWT_SECRET = 'test-owner-secret-with-sufficient-length';

  try {
    let result = await invoke(loginBusinessOwner, {
      identifier: business.email,
      password: 'Old-password-123',
    });
    assert.equal(result.status, 401);

    result = await invoke(loginBusinessOwner, {
      identifier: business.email,
      password: 'New-password-456',
    });
    assert.equal(result.status, 200);
    assert.ok(result.payload.token);
    assert.equal(result.payload.data.name, 'Existing VOMA Business');
  } finally {
    Owner.findOne = originalOwnerFindOne;
    Business.find = originalBusinessFind;
    Business.findById = originalFindById;
    if (originalSecret === undefined) delete process.env.OWNER_JWT_SECRET;
    else process.env.OWNER_JWT_SECRET = originalSecret;
  }
});

test('successful legacy Business login creates and links one Owner identity', async () => {
  const originals = {
    ownerFindOne: Owner.findOne, ownerFindById: Owner.findById, ownerCreate: Owner.create,
    businessFind: Business.find, businessCreate: Business.create, businessDeleteOne: Business.deleteOne,
  };
  const business = createBusinessDocument();
  business.phone = '08012345678';
  business.passwordHash = await bcrypt.hash('Legacy-password-123', 4);
  let createdOwner = null;
  let createCount = 0;
  let businessMutationCount = 0;
  try {
    Owner.findOne = () => selected(null);
    Owner.findById = () => selected(null);
    Owner.create = async (values) => {
      createCount += 1;
      createdOwner = { _id: '507f191e810c19729de860ea', ...values, async save() {} };
      return createdOwner;
    };
    Business.find = () => businessList([business]);
    Business.create = async () => { businessMutationCount += 1; };
    Business.deleteOne = async () => { businessMutationCount += 1; };
    const result = await invoke(loginBusinessOwner, {
      identifier: ' OWNER@EXAMPLE.COM ', password: 'Legacy-password-123',
    });
    assert.equal(result.status, 200);
    assert.equal(createCount, 1);
    assert.equal(String(business.ownerId), String(createdOwner._id));
    assert.equal(createdOwner.emailKey, 'owner@example.com');
    assert.equal(createdOwner.phoneKey, '2348012345678');
    assert.equal(businessMutationCount, 0);
  } finally {
    Owner.findOne = originals.ownerFindOne;
    Owner.findById = originals.ownerFindById;
    Owner.create = originals.ownerCreate;
    Business.find = originals.businessFind;
    Business.create = originals.businessCreate;
    Business.deleteOne = originals.businessDeleteOne;
  }
});

test('repeated Owner login uses the linked Owner without duplicating it', async () => {
  const originals = { ownerFindOne: Owner.findOne, ownerCreate: Owner.create, businessFind: Business.find, businessFindById: Business.findById };
  const business = createBusinessDocument();
  const owner = {
    _id: '507f191e810c19729de860ea', businessId: business._id,
    passwordHash: await bcrypt.hash('Owner-password-123', 4), async save() {},
  };
  let createCount = 0;
  try {
    Owner.findOne = () => selected(owner);
    Owner.create = async () => { createCount += 1; };
    Business.find = () => businessList([]);
    Business.findById = async () => business;
    const first = await invoke(loginBusinessOwner, { identifier: 'owner@example.com', password: 'Owner-password-123' });
    const second = await invoke(loginBusinessOwner, { identifier: 'owner@example.com', password: 'Owner-password-123' });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(createCount, 0);
  } finally {
    Owner.findOne = originals.ownerFindOne;
    Owner.create = originals.ownerCreate;
    Business.find = originals.businessFind;
    Business.findById = originals.businessFindById;
  }
});

test('Google authentication rejects missing configuration and invalid credentials', async () => {
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalSecret = process.env.OWNER_JWT_SECRET;
  const originalVerify = OAuth2Client.prototype.verifyIdToken;
  try {
    delete process.env.GOOGLE_CLIENT_ID;
    process.env.OWNER_JWT_SECRET = 'test-owner-secret-with-sufficient-length';
    let result = await invoke(googleOwnerLogin, { credential: 'invalid' });
    assert.equal(result.status, 500);
    assert.equal(result.payload.message, 'Google sign-in is not configured.');

    process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
    OAuth2Client.prototype.verifyIdToken = async () => { throw new Error('invalid'); };
    result = await invoke(googleOwnerLogin, { credential: 'invalid' });
    assert.equal(result.status, 401);
    assert.equal(result.payload.message, 'Unable to sign in with Google. Please try again.');
  } finally {
    OAuth2Client.prototype.verifyIdToken = originalVerify;
    if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = originalClientId;
    if (originalSecret === undefined) delete process.env.OWNER_JWT_SECRET;
    else process.env.OWNER_JWT_SECRET = originalSecret;
  }
});

test('Google authentication links an existing business once and returns the dashboard JWT', async () => {
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalSecret = process.env.OWNER_JWT_SECRET;
  const originalVerify = OAuth2Client.prototype.verifyIdToken;
  const originalOwnerFindOne = Owner.findOne;
  const originalOwnerCreate = Owner.create;
  const originalOwnerDeleteOne = Owner.deleteOne;
  const originalBusinessFind = Business.find;
  const originalBusinessUpdateOne = Business.updateOne;
  const originalBusinessFindById = Business.findById;
  const business = createBusinessDocument();
  const originalPasswordHash = await bcrypt.hash('Existing-password-123', 4);
  business.passwordHash = originalPasswordHash;
  business.ownerId = null;
  let savedOwner = null;
  let createCount = 0;

  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  process.env.OWNER_JWT_SECRET = 'test-owner-secret-with-sufficient-length';
  OAuth2Client.prototype.verifyIdToken = async () => ({
    getPayload: () => ({
      sub: 'google-subject-123',
      email: 'OWNER@example.com',
      email_verified: true,
      name: 'Existing Owner',
      picture: 'https://example.com/avatar.jpg',
    }),
  });
  Owner.findOne = (query) => selected(
    savedOwner && (query.googleId === savedOwner.googleId || query.email === savedOwner.email)
      ? savedOwner
      : null
  );
  Owner.create = async (values) => {
    createCount += 1;
    savedOwner = {
      _id: '507f191e810c19729de860ea',
      id: '507f191e810c19729de860ea',
      ...values,
      async save() {},
    };
    return savedOwner;
  };
  Owner.deleteOne = async () => ({ deletedCount: 1 });
  Business.find = () => ({ select() { return this; }, limit: async () => [business] });
  Business.updateOne = async () => {
    business.ownerId = savedOwner._id;
    return { modifiedCount: 1 };
  };
  Business.findById = async () => business;

  try {
    let result = await invoke(googleOwnerLogin, { credential: 'verified-google-id-token' });
    assert.equal(result.status, 200);
    assert.equal(result.payload.data.name, business.name);
    assert.equal(createCount, 1);
    assert.equal(business.passwordHash, originalPasswordHash);
    let decoded = jwt.verify(result.payload.token, process.env.OWNER_JWT_SECRET);
    assert.equal(decoded.role, 'business-owner');
    assert.equal(decoded.sub, business._id);

    result = await invoke(googleOwnerLogin, { credential: 'verified-google-id-token' });
    assert.equal(result.status, 200);
    assert.equal(createCount, 1);
    decoded = jwt.verify(result.payload.token, process.env.OWNER_JWT_SECRET);
    assert.equal(decoded.role, 'business-owner');
  } finally {
    OAuth2Client.prototype.verifyIdToken = originalVerify;
    Owner.findOne = originalOwnerFindOne;
    Owner.create = originalOwnerCreate;
    Owner.deleteOne = originalOwnerDeleteOne;
    Business.find = originalBusinessFind;
    Business.updateOne = originalBusinessUpdateOne;
    Business.findById = originalBusinessFindById;
    if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = originalClientId;
    if (originalSecret === undefined) delete process.env.OWNER_JWT_SECRET;
    else process.env.OWNER_JWT_SECRET = originalSecret;
  }
});

test('Google authentication reuses an Owner with the same normalized email', async () => {
  const originals = {
    verify: OAuth2Client.prototype.verifyIdToken, ownerFindOne: Owner.findOne,
    ownerCreate: Owner.create, businessFind: Business.find,
  };
  const owner = {
    _id: '507f191e810c19729de860ea', id: '507f191e810c19729de860ea',
    email: 'owner@example.com', emailKey: 'owner@example.com', googleId: '',
    authProvider: 'password', passwordHash: 'existing-hash', businessId: null,
    name: 'Owner', avatar: '', async save() {},
  };
  let createCount = 0;
  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => ({
    sub: 'google-existing-owner', email: ' OWNER@Example.com ', email_verified: true,
  }) });
  try {
    Owner.findOne = (query) => selected(query.googleId ? null : owner);
    Owner.create = async () => { createCount += 1; };
    Business.find = () => businessList([]);
    const result = await invoke(googleOwnerLogin, { credential: 'valid' });
    assert.equal(result.status, 200);
    assert.equal(createCount, 0);
    assert.equal(owner.googleId, 'google-existing-owner');
    assert.equal(owner.authProvider, 'password+google');
  } finally {
    OAuth2Client.prototype.verifyIdToken = originals.verify;
    Owner.findOne = originals.ownerFindOne;
    Owner.create = originals.ownerCreate;
    Business.find = originals.businessFind;
  }
});

test('Google authentication never auto-claims multiple contact-only listings', async () => {
  const originals = {
    verify: OAuth2Client.prototype.verifyIdToken, ownerFindOne: Owner.findOne,
    ownerCreate: Owner.create, businessFind: Business.find, businessUpdateOne: Business.updateOne,
  };
  let owner;
  let updateCount = 0;
  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => ({
    sub: 'google-ambiguous', email: 'shared@example.com', email_verified: true,
  }) });
  try {
    Owner.findOne = () => selected(null);
    Owner.create = async (values) => {
      owner = { _id: '507f191e810c19729de860ea', id: '507f191e810c19729de860ea', ...values, async save() {} };
      return owner;
    };
    Business.find = () => businessList([
      { _id: '507f1f77bcf86cd799439011', ownerId: null, passwordHash: '' },
      { _id: '507f1f77bcf86cd799439012', ownerId: null, passwordHash: '' },
    ]);
    Business.updateOne = async () => { updateCount += 1; return { modifiedCount: 1 }; };
    const result = await invoke(googleOwnerLogin, { credential: 'valid' });
    assert.equal(result.status, 200);
    assert.equal(result.payload.claimStatus, 'ambiguous');
    assert.equal(result.payload.data, null);
    assert.equal(updateCount, 0);
    assert.equal(owner.businessId, undefined);
    assert.equal(owner.passwordHash, undefined);
  } finally {
    OAuth2Client.prototype.verifyIdToken = originals.verify;
    Owner.findOne = originals.ownerFindOne;
    Owner.create = originals.ownerCreate;
    Business.find = originals.businessFind;
    Business.updateOne = originals.businessUpdateOne;
  }
});

test('password+google Owner remains usable with password login', async () => {
  const originals = { ownerFindOne: Owner.findOne, businessFindById: Business.findById, businessFind: Business.find };
  const business = createBusinessDocument();
  const owner = {
    _id: '507f191e810c19729de860ea',
    emailKey: 'owner@example.com',
    businessId: business._id,
    authProvider: 'password+google',
    googleId: 'google-subject',
    passwordHash: await bcrypt.hash('Hybrid-password-123', 4),
    async save() {},
  };
  try {
    Owner.findOne = () => selected(owner);
    Business.findById = async () => business;
    Business.find = () => businessList([]);
    const result = await invoke(loginBusinessOwner, {
      identifier: 'owner@example.com', password: 'Hybrid-password-123',
    });
    assert.equal(result.status, 200);
    assert.ok(result.payload.token);
  } finally {
    Owner.findOne = originals.ownerFindOne;
    Business.findById = originals.businessFindById;
    Business.find = originals.businessFind;
  }
});

test('legacy business-owner JWT remains valid for dashboard middleware', async () => {
  const originalFindById = Business.findById;
  const originalOwnerFindById = Owner.findById;
  const business = createBusinessDocument();
  Business.findById = async () => business;
  Owner.findById = async () => null;
  const token = jwt.sign({ sub: business._id, role: 'business-owner' }, process.env.OWNER_JWT_SECRET);
  try {
    await new Promise((resolve, reject) => {
      const req = { get: () => `Bearer ${token}` };
      const res = { status() { return this; }, json: reject };
      requireOwnerAuth(req, res, (error) => {
        if (error) return reject(error);
        assert.equal(req.ownerBusiness, business);
        resolve();
      });
    });
  } finally {
    Business.findById = originalFindById;
    Owner.findById = originalOwnerFindById;
  }
});

test('linked Owner JWT keeps Business subject compatibility', () => {
  const token = jwt.sign({
    sub: '507f1f77bcf86cd799439011', role: 'business-owner', ownerId: '507f191e810c19729de860ea',
  }, process.env.OWNER_JWT_SECRET);
  const decoded = jwt.verify(token, process.env.OWNER_JWT_SECRET);
  assert.equal(decoded.role, 'business-owner');
  assert.equal(decoded.sub, '507f1f77bcf86cd799439011');
  assert.equal(decoded.ownerId, '507f191e810c19729de860ea');
});

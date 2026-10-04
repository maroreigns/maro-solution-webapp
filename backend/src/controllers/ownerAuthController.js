const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { Owner } = require('../models/Owner');
const { Business } = require('../models/Business');
const { asyncHandler } = require('../utils/asyncHandler');
const { getOwnerJwtSecret } = require('../middleware/ownerAuth');
const { emailLookup, normalizeEmail } = require('../utils/identity');

function buildAccountToken(owner, business) {
  const subject = business ? business._id : owner._id;
  const role = business ? 'business-owner' : 'owner-account';
  return jwt.sign({ sub: String(subject), role, ownerId: String(owner._id) }, getOwnerJwtSecret(), {
    expiresIn: '7d',
  });
}

function accountPayload(owner) {
  return {
    id: owner.id,
    name: owner.name,
    email: owner.email,
    avatar: owner.avatar,
    authProvider: owner.authProvider,
    hasBusiness: Boolean(owner.businessId),
  };
}

const googleOwnerLogin = asyncHandler(async (req, res) => {
  const credential = typeof req.body.credential === 'string' ? req.body.credential.trim() : '';
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const secret = getOwnerJwtSecret();

  if (!clientId || !secret) {
    return res.status(500).json({ success: false, message: 'Google sign-in is not configured.' });
  }
  if (!credential) {
    return res.status(400).json({ success: false, message: 'Google credential is required.' });
  }

  let googleProfile;
  try {
    const ticket = await new OAuth2Client(clientId).verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    googleProfile = ticket.getPayload();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Unable to sign in with Google. Please try again.' });
  }

  if (!googleProfile || !googleProfile.sub || !googleProfile.email || !googleProfile.email_verified) {
    return res.status(401).json({ success: false, message: 'A verified Google email is required.' });
  }

  const email = normalizeEmail(googleProfile.email);
  let owner = await Owner.findOne({ googleId: googleProfile.sub }).select('+googleId +passwordHash');

  if (owner && owner.email !== email) {
    return res.status(409).json({ success: false, message: 'This Google account no longer matches the linked email.' });
  }

  if (!owner) {
    owner = await Owner.findOne({ emailKey: email }).select('+googleId +passwordHash');
  }

  if (owner && owner.googleId && owner.googleId !== googleProfile.sub) {
    return res.status(409).json({ success: false, message: 'This email is already linked to another Google account.' });
  }

  let business = null;
  let claimStatus = 'none';

  if (!owner) {
    try {
      owner = await Owner.create({
        name: googleProfile.name || '',
        email,
        emailKey: email,
        googleId: googleProfile.sub,
        authProvider: 'google',
        avatar: googleProfile.picture || '',
        lastLoginAt: new Date(),
      });
    } catch (error) {
      if (error && error.code === 11000) {
        return res.status(409).json({ success: false, message: 'This Google account or email is already linked.' });
      }
      throw error;
    }
  } else {
    owner.googleId = googleProfile.sub;
    owner.authProvider = owner.passwordHash ? 'password+google' : 'google';
    owner.name = googleProfile.name || owner.name;
    owner.avatar = googleProfile.picture || owner.avatar;
    owner.lastLoginAt = new Date();
    await owner.save();
  }

  if (owner.businessId) {
    business = await Business.findById(owner.businessId);
  } else {
    const matchingBusinesses = await Business.find({ email: emailLookup(email) })
      .select('_id ownerId +passwordHash')
      .limit(3);
    const safelyLinkable = matchingBusinesses.filter(
      (item) => item.passwordHash && !item.ownerId
    );
    if (matchingBusinesses.length > 1) {
      claimStatus = 'ambiguous';
    } else if (safelyLinkable.length === 1) {
      const linked = await Business.updateOne(
        { _id: safelyLinkable[0]._id, ownerId: null },
        { $set: { ownerId: owner._id, googleId: googleProfile.sub } }
      );
      if (linked.modifiedCount) {
        owner.passwordHash = safelyLinkable[0].passwordHash;
        owner.authProvider = 'password+google';
        owner.businessId = safelyLinkable[0]._id;
        await owner.save();
        business = await Business.findById(safelyLinkable[0]._id);
      }
    } else if (matchingBusinesses.length === 1) {
      claimStatus = 'verification-required';
    }
  }

  return res.json({
    success: true,
    message: business
      ? 'Google login successful.'
      : claimStatus === 'ambiguous'
        ? 'Google account verified. Multiple listings use this email, so none were claimed automatically.'
        : 'Google account verified. Add your business to continue.',
    token: buildAccountToken(owner, business),
    data: business,
    account: accountPayload(owner),
    claimStatus,
  });
});

const getGoogleAuthConfig = (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  res.json({ success: true, enabled: Boolean(clientId), clientId });
};

module.exports = { getGoogleAuthConfig, googleOwnerLogin };

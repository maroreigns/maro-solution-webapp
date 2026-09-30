const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { Owner } = require('../models/Owner');
const { Business } = require('../models/Business');
const { asyncHandler } = require('../utils/asyncHandler');
const { getOwnerJwtSecret } = require('../middleware/ownerAuth');

function buildAccountToken(owner) {
  return jwt.sign({ sub: String(owner._id), role: 'owner-account' }, getOwnerJwtSecret(), {
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

  const email = googleProfile.email.trim().toLowerCase();
  let owner = await Owner.findOne({ googleId: googleProfile.sub }).select('+googleId');

  if (owner && owner.email !== email) {
    return res.status(409).json({ success: false, message: 'This Google account no longer matches the linked email.' });
  }

  if (!owner) {
    owner = await Owner.findOne({ email }).select('+googleId');
  }

  if (owner && owner.googleId !== googleProfile.sub) {
    return res.status(409).json({ success: false, message: 'This email is already linked to another Google account.' });
  }

  if (!owner) {
    const matchingBusinesses = await Business.find({ email }).select('_id ownerId').limit(2);
    if (matchingBusinesses.length > 1) {
      return res.status(409).json({
        success: false,
        message: 'More than one listing uses this email. Please contact support before linking Google sign-in.',
      });
    }
    if (matchingBusinesses[0] && matchingBusinesses[0].ownerId) {
      return res.status(409).json({
        success: false,
        message: 'This business is already linked to an owner account. Please contact support.',
      });
    }

    try {
      owner = await Owner.create({
        name: googleProfile.name || '',
        email,
        googleId: googleProfile.sub,
        avatar: googleProfile.picture || '',
        businessId: matchingBusinesses[0] ? matchingBusinesses[0]._id : null,
        lastLoginAt: new Date(),
      });
    } catch (error) {
      if (error && error.code === 11000) {
        return res.status(409).json({ success: false, message: 'This Google account or email is already linked.' });
      }
      throw error;
    }

    if (matchingBusinesses[0]) {
      const linkedBusiness = await Business.updateOne(
        { _id: matchingBusinesses[0]._id, ownerId: null },
        { $set: { ownerId: owner._id } }
      );
      if (!linkedBusiness.modifiedCount) {
        await Owner.deleteOne({ _id: owner._id });
        return res.status(409).json({
          success: false,
          message: 'This business was linked by another request. Please try signing in again.',
        });
      }
    }
  } else {
    owner.name = googleProfile.name || owner.name;
    owner.avatar = googleProfile.picture || owner.avatar;
    owner.lastLoginAt = new Date();
    await owner.save();
  }

  const business = owner.businessId ? await Business.findById(owner.businessId) : null;
  return res.json({
    success: true,
    message: business ? 'Google login successful.' : 'Google account created. Add your business to continue.',
    token: buildAccountToken(owner),
    data: business,
    account: accountPayload(owner),
  });
});

module.exports = { googleOwnerLogin };

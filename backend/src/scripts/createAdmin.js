const path = require('path');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const { connectDatabase } = require('../config/db');
const { Admin } = require('../models/Admin');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function createAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set.');
  }

  await connectDatabase();

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await Admin.findOneAndUpdate(
    { email },
    {
      email,
      passwordHash,
      role: 'admin',
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  console.log(`Admin account ready for ${admin.email}.`);
}

createAdmin()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to create admin:', error.message);
    process.exit(1);
  });

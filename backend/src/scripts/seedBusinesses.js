const path = require('path');
const dotenv = require('dotenv');
const { connectDatabase } = require('../config/db');
const { Business } = require('../models/Business');
const { sampleBusinesses } = require('../data/sampleBusinesses');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function seedBusinesses() {
  try {
    await connectDatabase();
    await Business.deleteMany({});
    await Business.insertMany(
      sampleBusinesses.map((business) => ({
        ...business,
        status: 'approved',
        paymentStatus: 'verified',
      }))
    );
    console.log(`Seeded ${sampleBusinesses.length} businesses successfully.`);
    process.exit(0);
  } catch (error) {
    console.error('Failed to seed businesses:', error.message);
    process.exit(1);
  }
}

seedBusinesses();

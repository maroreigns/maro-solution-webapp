const path = require('path');
const dotenv = require('dotenv');
const { connectDatabase } = require('./config/db');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const { app } = require('./app');

const port = Number(process.env.PORT || 5000);

async function startServer() {
  try {
    try {
      await connectDatabase();
    } catch (error) {
      console.warn('MongoDB connection failed. Frontend will still load, but API requests will return 503.');
      console.warn(error.message);
    }

    app.listen(port, () => {
      console.log(`Maro Solution server is running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();

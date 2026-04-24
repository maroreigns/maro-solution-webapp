const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const { businessRoutes } = require('./routes/businessRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { isDatabaseReady } = require('./config/db');

const app = express();
const frontendDir = path.join(__dirname, '..', '..', 'frontend');
const configuredOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
];
const allowedOrigins = [
  ...configuredOrigins,
  'http://localhost:5001',
  'http://127.0.0.1:5001',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];
const uniqueAllowedOrigins = [...new Set(allowedOrigins.filter(Boolean))];

app.set('trust proxy', 1);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || uniqueAllowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('This origin is not allowed by CORS.'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: false,
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests from this IP. Please wait a bit and try again.',
    },
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(mongoSanitize());

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/api/businesses', (req, res, next) => {
  if (isDatabaseReady()) {
    return next();
  }

  return res.status(503).json({
    success: false,
    message: 'The database is currently unavailable. Please try again shortly.',
  });
});
app.use('/api/businesses', businessRoutes);
app.use(express.static(frontendDir));

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.get('/listings', (req, res) => {
  res.sendFile(path.join(frontendDir, 'listings.html'));
});

app.get('/add-business', (req, res) => {
  res.sendFile(path.join(frontendDir, 'add-business.html'));
});

app.use('/api', notFoundHandler);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { app };

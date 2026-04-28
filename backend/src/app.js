const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const { adminRoutes } = require('./routes/adminRoutes');
const { businessRoutes } = require('./routes/businessRoutes');
const { paymentRoutes } = require('./routes/paymentRoutes');
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
  'https://marosolutionapp.com',
  'https://www.marosolutionapp.com',
  'https://marosolutionwebapp.netlify.app',
  'http://localhost:5001',
  'http://127.0.0.1:5001',
];

const uniqueAllowedOrigins = [...new Set(allowedOrigins.filter(Boolean))];

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || uniqueAllowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const error = new Error('This origin is not allowed by CORS.');
      error.statusCode = 403;
      return callback(error);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: false,
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
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

app.use('/api/admin', (req, res, next) => {
  if (isDatabaseReady()) {
    return next();
  }

  return res.status(503).json({
    success: false,
    message: 'The database is currently unavailable. Please try again shortly.',
  });
});

app.use('/api/businesses', (req, res, next) => {
  if (isDatabaseReady()) {
    return next();
  }

  return res.status(503).json({
    success: false,
    message: 'The database is currently unavailable. Please try again shortly.',
  });
});

app.use('/api/payments', (req, res, next) => {
  if (isDatabaseReady()) {
    return next();
  }

  return res.status(503).json({
    success: false,
    message: 'The database is currently unavailable. Please try again shortly.',
  });
});

app.use('/api/admin', adminRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/payments', paymentRoutes);

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

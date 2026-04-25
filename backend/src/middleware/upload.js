const path = require('path');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

function buildPublicId(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  const safeBaseName = path
    .basename(file.originalname, extension)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return `${Date.now()}-${safeBaseName || 'business'}`;
}

function ensureCloudinaryConfig() {
  const requiredVariables = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ];
  const missingVariables = requiredVariables.filter((name) => !process.env[name]);

  if (missingVariables.length) {
    const error = new Error(
      `Cloudinary is not configured. Missing: ${missingVariables.join(', ')}.`
    );
    error.statusCode = 500;
    throw error;
  }
}

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    ensureCloudinaryConfig();

    return {
      folder: 'maro-solution/businesses',
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      public_id: buildPublicId(file),
    };
  },
});

function fileFilter(req, file, cb) {
  const extension = path.extname(file.originalname).toLowerCase();

  if (!allowedExtensions.includes(extension) || !allowedMimeTypes.includes(file.mimetype)) {
    const error = new Error('Only JPG, JPEG, PNG, and WEBP image uploads are allowed.');
    error.statusCode = 400;
    return cb(error);
  }

  cb(null, true);
}

const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.MAX_FILE_SIZE_MB || 3) * 1024 * 1024,
  },
  fileFilter,
});

module.exports = { upload };

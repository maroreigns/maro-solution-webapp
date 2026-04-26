function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: 'The requested resource was not found.',
  });
}

function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || error.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const fallbackMessage =
    'Something went wrong while processing your request. Please try again.';
  const message =
    error.publicMessage ||
    (isProduction && statusCode >= 500 ? fallbackMessage : error.message) ||
    fallbackMessage;

  if (error.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      message:
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Profile image is too large. Please upload an image within the allowed size limit.'
          : 'There was a problem uploading your profile image.',
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'The provided business ID is invalid.',
    });
  }

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation failed while saving the business.',
      errors: Object.values(error.errors).map((item) => item.message),
    });
  }

  console.error(error);

  res.status(statusCode).json({
    success: false,
    message,
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};

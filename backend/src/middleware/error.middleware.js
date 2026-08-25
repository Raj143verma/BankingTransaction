/**
 * Centralized Error & 404 Handling Middleware
 */

/**
 * Standard 404 Not Found handler for unmatched routes
 */
function notFoundHandler(req, res, next) {
  return res.status(404).json({
    status: 'error',
    message: 'Route not found',
  });
}

/**
 * Global application error handler
 */
function errorHandler(err, req, res, next) {
  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode = err.statusCode || err.status || 500;

  // Log error on server without leaking sensitive request properties
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, {
    status: statusCode,
    message: err.message,
    stack: !isProduction ? err.stack : undefined,
  });

  // Handle Mongoose / MongoDB CastError & ValidationError cleanly
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      status: 'error',
      message: err.message,
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      status: 'error',
      message: `Invalid format for field: ${err.path}`,
    });
  }

  // Handle Payload Too Large error (e.g. from express.json limit)
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      status: 'error',
      message: 'Request payload is too large. Maximum allowed size is 10kb.',
    });
  }

  // Handle CSRF / CORS / Syntax errors in JSON body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      status: 'error',
      message: 'Malformed JSON payload in request body.',
    });
  }

  // Production Error Sanitization
  const safeMessage =
    statusCode >= 400 && statusCode < 500
      ? err.message
      : isProduction
      ? 'An unexpected error occurred'
      : err.message || 'An unexpected error occurred';

  return res.status(statusCode).json({
    status: 'error',
    message: safeMessage,
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};

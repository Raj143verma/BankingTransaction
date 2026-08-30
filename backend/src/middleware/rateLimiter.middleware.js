const rateLimit = require('express-rate-limit');

/**
 * Global API rate limiter
 * Allows 300 requests per 15 minutes per IP across all /api endpoints
 */
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many API requests from this IP. Please slow down and try again later.',
  },
});

/**
 * Authentication rate limiter
 * Allows 10 login / register attempts per 15 minutes per IP to prevent brute-force attacks
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 1000 : parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
  },
});

/**
 * Customer financial transfer rate limiter
 * Allows 30 transfer requests per 1 minute per IP / user
 */
const transactionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Transaction rate limit exceeded. Please wait a moment before initiating another transfer.',
  },
});

/**
 * System Fund initialization rate limiter
 * Dedicated to administrative fund allocation operations (60 per minute)
 */
const systemFundLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'System fund allocation rate limit reached. Please wait before processing further allocations.',
  },
});

module.exports = {
  globalApiLimiter,
  authLimiter,
  transactionLimiter,
  systemFundLimiter,
};

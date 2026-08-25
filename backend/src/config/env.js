/**
 * Environment Variable Validation and Configuration
 * Fails fast on server startup if critical configuration is missing or invalid.
 */

function validateEnv() {
  const errors = [];

  // 1. Validate JWT_SECRET
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || typeof jwtSecret !== 'string' || jwtSecret.trim().length === 0) {
    errors.push('Missing required environment variable: JWT_SECRET');
  } else if (jwtSecret.trim().length < 32) {
    errors.push('Invalid environment variable: JWT_SECRET must be at least 32 characters long for security');
  }

  // 2. Validate MONGO_URI
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri || typeof mongoUri !== 'string' || mongoUri.trim().length === 0) {
    errors.push('Missing required environment variable: MONGO_URI');
  } else if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
    errors.push('Invalid environment variable: MONGO_URI must start with "mongodb://" or "mongodb+srv://"');
  }

  // 3. Validate PORT (optional with default 3000)
  if (process.env.PORT) {
    const port = Number(process.env.PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push('Invalid environment variable: PORT must be an integer between 1 and 65535');
    }
  }

  // 4. Validate CLIENT_URL (optional with default http://localhost:5173)
  if (process.env.CLIENT_URL) {
    try {
      new URL(process.env.CLIENT_URL);
    } catch {
      errors.push('Invalid environment variable: CLIENT_URL must be a valid absolute URL');
    }
  }

  if (errors.length > 0) {
    console.error('\n==================================================');
    console.error('❌ FATAL: ENVIRONMENT CONFIGURATION VALIDATION FAILED');
    console.error('==================================================');
    errors.forEach((err) => console.error(` - ${err}`));
    console.error('==================================================\n');
    throw new Error(`Environment validation failed: ${errors.join(', ')}`);
  }

  return {
    JWT_SECRET: process.env.JWT_SECRET.trim(),
    MONGO_URI: process.env.MONGO_URI.trim(),
    PORT: parseInt(process.env.PORT, 10) || 3000,
    CLIENT_URL: process.env.CLIENT_URL ? process.env.CLIENT_URL.trim() : 'http://localhost:5173',
    NODE_ENV: process.env.NODE_ENV || 'development',
  };
}

module.exports = {
  validateEnv,
};

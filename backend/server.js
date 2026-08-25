require('dotenv').config();
const { validateEnv } = require('./src/config/env');

// Validate critical environment variables before starting server
const config = validateEnv();

const app = require('./src/app');
const connectToDB = require('./src/config/db.js');
connectToDB();

const PORT = config.PORT;

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} [${config.NODE_ENV}]`);
});

// Handle uncaught exceptions and unhandled promise rejections safely
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! Shutting down gracefully...', err);
  server.close(() => {
    process.exit(1);
  });
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...', err);
  process.exit(1);
});
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookiesParser = require('cookie-parser');

const { globalApiLimiter } = require('./middleware/rateLimiter.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

/** Routes required here */
const authRouter = require('./routes/auth.routes');
const accountRouter = require('./routes/account.routes');
const transactionRouter = require('./routes/transaction.routes');
const accountApplicationRouter = require('./routes/accountApplication.routes');
const auditLogRouter = require('./routes/auditLog.routes');
const reconciliationRouter = require('./routes/reconciliation.routes');
const notificationRouter = require('./routes/notification.routes');
const beneficiaryRouter = require('./routes/beneficiary.routes');
const transferLimitRouter = require('./routes/transferLimit.routes');
const { authSystemUserMiddleware } = require('./middleware/auth.middleware');
const transferLimitController = require('./controllers/transferLimit.controller');

const app = express();

const systemTransferLimitRouter = express.Router();
systemTransferLimitRouter.get('/', authSystemUserMiddleware, transferLimitController.getSystemTransferLimits);
systemTransferLimitRouter.patch('/', authSystemUserMiddleware, transferLimitController.updateSystemTransferLimits);

// Phase E: Trust Proxy configuration (for reverse proxies like Nginx/Cloudflare/AWS)
app.set('trust proxy', 1);

// Phase B: Security HTTP Headers with Helmet
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts:
      process.env.NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
  })
);

// Phase J: Controlled CORS
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || origin === process.env.CLIENT_URL) {
        return callback(null, true);
      }
      return callback(new Error('CORS policy: Not allowed by origin'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Phase C: Request Body and URL limits
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookiesParser());

// Phase A: Global API Rate Limiter
app.use('/api', globalApiLimiter);

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/accounts', accountRouter);
app.use('/api/transactions', transactionRouter);
app.use('/api/account-applications', accountApplicationRouter);
app.use('/api/audit-logs', auditLogRouter);
app.use('/api/reconciliation', reconciliationRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/beneficiaries', beneficiaryRouter);
app.use('/api/transfer-limits', transferLimitRouter);
app.use('/api/system/transfer-limits', systemTransferLimitRouter);

// Phase G: 404 Handler for unmatched routes
app.use(notFoundHandler);

// Phase F: Centralized Global Error Handler
app.use(errorHandler);

module.exports = app;
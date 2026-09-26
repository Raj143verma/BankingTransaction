const { Router } = require('express');
const { authMiddleware, authSystemUserMiddleware } = require('../middleware/auth.middleware');
const transferLimitController = require('../controllers/transferLimit.controller');

const transferLimitRouter = Router();

/**
 * GET /api/transfer-limits
 * Retrieve customer-safe transfer limit information and remaining daily allowances
 */
transferLimitRouter.get('/', authMiddleware, transferLimitController.getCustomerTransferLimits);

/**
 * GET /api/transfer-limits/system
 * Retrieve administrative transfer limit configuration (System User only)
 */
transferLimitRouter.get('/system', authSystemUserMiddleware, transferLimitController.getSystemTransferLimits);

/**
 * PATCH /api/transfer-limits/system
 * Update administrative transfer limit configuration (System User only)
 */
transferLimitRouter.patch('/system', authSystemUserMiddleware, transferLimitController.updateSystemTransferLimits);

module.exports = transferLimitRouter;

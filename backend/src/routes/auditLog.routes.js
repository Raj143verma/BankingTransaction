const { Router } = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const auditLogController = require('../controllers/auditLog.controller');

const auditLogRouter = Router();

/**
 * GET /api/audit-logs
 * Retrieve paginated and filtered audit trail records (System User only)
 * Protected System User Route
 */
auditLogRouter.get('/', authMiddleware.authSystemUserMiddleware, auditLogController.getAuditLogsController);

/**
 * GET /api/audit-logs/:id
 * Retrieve detailed audit record by ID (System User only)
 * Protected System User Route
 */
auditLogRouter.get('/:id', authMiddleware.authSystemUserMiddleware, auditLogController.getAuditLogByIdController);

module.exports = auditLogRouter;

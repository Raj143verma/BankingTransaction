const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const reconciliationController = require('../controllers/reconciliation.controller');

const router = express.Router();

// All reconciliation endpoints require System User / Admin authorization
router.use(authMiddleware.authSystemUserMiddleware);

/**
 * POST /api/reconciliation/run
 * Trigger an explicit financial reconciliation run across all ledger records.
 */
router.post('/run', reconciliationController.runReconciliationController);

/**
 * GET /api/reconciliation/runs
 * Retrieve paginated historical reconciliation runs.
 */
router.get('/runs', reconciliationController.getReconciliationRunsController);

/**
 * GET /api/reconciliation/anomalies
 * Query anomalies across latest or specific reconciliation runs.
 */
router.get('/anomalies', reconciliationController.getReconciliationAnomaliesController);

/**
 * GET /api/reconciliation/runs/:id/export/csv
 * Export reconciliation run report as CSV.
 */
router.get('/runs/:id/export/csv', reconciliationController.exportReconciliationCsvController);

/**
 * GET /api/reconciliation/runs/:id/export/pdf
 * Export reconciliation run report as PDF.
 */
router.get('/runs/:id/export/pdf', reconciliationController.exportReconciliationPdfController);

/**
 * GET /api/reconciliation/runs/:id
 * Retrieve full details of a specific reconciliation run.
 */
router.get('/runs/:id', reconciliationController.getReconciliationRunByIdController);

module.exports = router;

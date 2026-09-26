const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const accountController = require('../controllers/account.controller');
const statementController = require('../controllers/statement.controller');

const router = express.Router();

/**
 * POST /api/accounts/
 * Create a new account
 * Protected Route
 */
router.post('/', authMiddleware.authMiddleware, accountController.createAccountController);

/**
 * GET /api/accounts/customer-accounts
 * Get all active customer accounts (System User only)
 * Protected System User Route
 */
router.get(
  '/customer-accounts',
  authMiddleware.authSystemUserMiddleware,
  accountController.getCustomerAccountsController
);

/**
 * GET /api/accounts/
 * Get all accounts of the logged in user
 * Protected Route
 */
router.get('/', authMiddleware.authMiddleware, accountController.getUserAccountsController);

/**
 * GET /api/accounts/balance/:accountId
 * Derived ledger balance for specific account
 * Protected Route
 */
router.get(
  '/balance/:accountId',
  authMiddleware.authMiddleware,
  accountController.getAccountBalanceController
);

/**
 * PATCH /api/accounts/:id/status
 * Update customer account lifecycle status (System User only)
 * Protected System User Route
 */
router.patch(
  '/:id/status',
  authMiddleware.authSystemUserMiddleware,
  accountController.updateAccountStatusController
);

/**
 * GET /api/accounts/:id/statement/export/csv
 * Export authoritative account statement as CSV
 * Protected Route (Customer owns account OR System User)
 */
router.get(
  '/:id/statement/export/csv',
  authMiddleware.authMiddleware,
  statementController.exportCsvStatementController
);

/**
 * GET /api/accounts/:id/statement/export/pdf
 * Export authoritative account statement as PDF
 * Protected Route (Customer owns account OR System User)
 */
router.get(
  '/:id/statement/export/pdf',
  authMiddleware.authMiddleware,
  statementController.exportPdfStatementController
);

/**
 * GET /api/accounts/:id/statement
 * Retrieve authoritative account statement (JSON, PDF, CSV via query or header)
 * Protected Route (Customer owns account OR System User)
 */
router.get(
  '/:id/statement',
  authMiddleware.authMiddleware,
  statementController.getAccountStatementController
);

module.exports = router;
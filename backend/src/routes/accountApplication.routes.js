const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const accountApplicationController = require('../controllers/accountApplication.controller');

const router = express.Router();

/**
 * POST /api/account-applications
 * Submit a customer account opening application
 * Protected Route (Authentication required)
 */
router.post(
  '/',
  authMiddleware.authMiddleware,
  accountApplicationController.createAccountApplicationController
);

/**
 * GET /api/account-applications/my
 * Fetch all applications submitted by the logged-in customer
 * Protected Route (Authentication required)
 */
router.get(
  '/my',
  authMiddleware.authMiddleware,
  accountApplicationController.getMyAccountApplicationsController
);

/**
 * SYSTEM USER ROUTES
 * Note: Must be defined before '/:id' to avoid Express route parameter shadowing.
 */

/**
 * GET /api/account-applications/system
 * Fetch customer account applications for system review (with optional status filter)
 * Protected System User Route
 */
router.get(
  '/system',
  authMiddleware.authSystemUserMiddleware,
  accountApplicationController.getSystemAccountApplicationsController
);

/**
 * GET /api/account-applications/system/:id
 * Fetch complete details of one application for system review
 * Protected System User Route
 */
router.get(
  '/system/:id',
  authMiddleware.authSystemUserMiddleware,
  accountApplicationController.getSystemAccountApplicationByIdController
);

/**
 * POST /api/account-applications/system/:id/approve
 * Atomically approve an application and create customer's ACTIVE deposit account
 * Protected System User Route
 */
router.post(
  '/system/:id/approve',
  authMiddleware.authSystemUserMiddleware,
  accountApplicationController.approveAccountApplicationController
);

/**
 * POST /api/account-applications/system/:id/reject
 * Reject a customer account opening application with a mandatory rejection reason
 * Protected System User Route
 */
router.post(
  '/system/:id/reject',
  authMiddleware.authSystemUserMiddleware,
  accountApplicationController.rejectAccountApplicationController
);

/**
 * GET /api/account-applications/:id
 * Fetch a specific application by ID (Customer ownership verified)
 * Protected Route (Authentication required)
 */
router.get(
  '/:id',
  authMiddleware.authMiddleware,
  accountApplicationController.getAccountApplicationByIdController
);

module.exports = router;

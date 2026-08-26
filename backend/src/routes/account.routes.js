const express = require("express")
const authMiddleware = require("../middleware/auth.middleware");
const accountController = require("../controllers/account.controller");


const router = express.Router()




/**
 * -Post /api/accounts/
 * - Create a new account
 *  -Protected Route
 */
router.post("/", authMiddleware.authMiddleware, accountController.createAccountController)

/**
 * -Get /api/accounts/customer-accounts
 * - Get all active customer accounts (System User only)
 * - Protected System User Route
 */
router.get("/customer-accounts", authMiddleware.authSystemUserMiddleware, accountController.getCustomerAccountsController)

/**
 * -Get /api/accounts/
 * - Get all accounts of the logged in user
 * - Protected Route
 */
router.get("/", authMiddleware.authMiddleware, accountController.getUserAccountsController)
 

/**
 * - GET/ api/ accounts/balance/:accountId
 */
router.get("/balance/:accountId", authMiddleware.authMiddleware, accountController.getAccountBalanceController)

/**
 * - PATCH /api/accounts/:id/status
 * - Update customer account lifecycle status (System User only)
 * - Protected System User Route
 */
router.patch("/:id/status", authMiddleware.authSystemUserMiddleware, accountController.updateAccountStatusController)

module.exports = router
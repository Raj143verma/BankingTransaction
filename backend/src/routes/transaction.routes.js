const { Router } = require("express")
const authMiddleware = require("../middleware/auth.middleware")
const transactionController = require("../controllers/transaction.controller")
const { transactionLimiter, systemFundLimiter } = require("../middleware/rateLimiter.middleware")

const transactionRouter = Router()

/**
 * POST /api/transactions/
 * Create a new P2P fund transfer (Rate limited: 30 req / 1 min)
 * Protected Route
 */ 
transactionRouter.post('/', authMiddleware.authMiddleware, transactionLimiter, transactionController.createTransaction)

/**
 * GET /api/transactions/summary
 * Retrieve transaction financial totals (credits, debits, net movement)
 * Protected Route
 */
transactionRouter.get('/summary', authMiddleware.authMiddleware, transactionController.getTransactionSummary)

/**
 * GET /api/transactions
 * Retrieve paginated and filtered transactions for authenticated user
 * Protected Route
 */
transactionRouter.get('/', authMiddleware.authMiddleware, transactionController.getTransactions)

/**
 * POST /api/transactions/system/initialize-funds
 * Create initial funds allocation transaction from system user (Rate limited: 60 req / 1 min)
 * Protected System User Route
 */
transactionRouter.post('/system/initialize-funds', authMiddleware.authSystemUserMiddleware, systemFundLimiter, transactionController.createinitializeFundsTransaction)

module.exports = transactionRouter
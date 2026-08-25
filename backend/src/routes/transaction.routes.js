const {Router} = require("express")
const authMiddleware = require("../middleware/auth.middleware")
const transactionController = require("../controllers/transaction.controller")



const transactionRouter = Router()


/** * - Post /api/transactions/
 * - Create a new transaction
 * - Protected Route
 */ 
transactionRouter.post('/', authMiddleware.authMiddleware,  transactionController.createTransaction)

/**
 * - Get /api/transactions/summary
 * - Retrieve transaction financial totals (credits, debits, net movement)
 * - Protected Route
 */
transactionRouter.get('/summary', authMiddleware.authMiddleware, transactionController.getTransactionSummary)

/**
 * - Get /api/transactions
 * - Retrieve paginated and filtered transactions for authenticated user
 * - Protected Route
 */
transactionRouter.get('/', authMiddleware.authMiddleware, transactionController.getTransactions)

/**
 * -Post /api/transactions/system/initialize-funds
 * Create initial funds transaction from system user
 */

transactionRouter.post('/system/initialize-funds',authMiddleware.authSystemUserMiddleware, transactionController.createinitializeFundsTransaction)

module.exports = transactionRouter
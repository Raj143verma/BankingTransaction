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
 * -Post /api/transactions/system/initialize-funds
 * Create initial funds transaction from system user
 */

transactionRouter.post('/system/initialize-funds',authMiddleware.authSystemUserMiddleware, transactionController.createinitializeFundsTransaction)

module.exports = transactionRouter
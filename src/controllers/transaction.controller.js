const transactionModel = require("../models/transaction.model")
const ladgerModel = require("../models/ladger.model")
const accountModel = require("../models/account.model")
const mongoose = require("mongoose")
const emailService = require("../services/email.service")
const e = require("express")



/**
 * -Create a new transaction schema
 * The 10 step transaction process is as follows:
 * 1. Validate the request 
 * 2. Validate idempotency key
 * 3. check account status
 * 4.Drive sender balance from  ladger
 * 5. create a transaction with status pending
 * 6. Create a DEBIT ladger entry for sender
 * 7. Create a CREDIT ladger entry for receiver
 * 8.mark transaction as completed
 * 9. commit mongoose session
 * 10. send email notification to sender and receiver
 * */

async function createTransaction(req,res) {
    

    /**
     * Step 1: Validate the request
     */
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body;

    if(!fromAccount || !toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "FromAccount, ToAccount, Amount and IdempotencyKey are required to create a transaction",

        })
    }
    const fromUserAccount = await accountModel.findOne({
        _id: fromAccount,
       
    })
    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    })
    if(!fromUserAccount || !toUserAccount) {
        return res.status(400).json({
            message: "FromAccount or ToAccount not found"
        })
    }

    /**
     * Step 2: Validate idempotency key
     */

    const isTransactionAlreadyExists = await transactionModel.findOne({
        idempotencyKey: idempotencyKey
    })
    if(isTransactionAlreadyExists) {
        if(isTransactionAlreadyExists.status === "COMPLETED") {
            return res.status(200).json({
                message: "Transaction with this idempotency key already exists and is completed",
                transaction: isTransactionAlreadyExists
            })
        }
        if(isTransactionAlreadyExists.status === "PENDING") {
            return res.status(200).json({
                message: "Transaction with this idempotency key already exists and is pending"
            })
        }
        if(isTransactionAlreadyExists.status === "FAILED") {
            return res.status(500).json({
                message: "Transaction with this idempotency key already exists and is failed"
            })
        }
        if(isTransactionAlreadyExists.status === "REVERSED") {
            return res.status(500).json({
                message: "Transaction with this idempotency key already exists and is reversed"
})
        }
    }

    /**
     * Step 3: Check account status
     */

    if(fromUserAccount.status !== "ACTIVE" || toUserAccount.status !== "ACTIVE") {
        return res.status(400).json({
            message: "FromAccount or ToAccount is not active"
        })
    }

    /**
     * Step 4: Drive sender balance from ladger
     */

    const balance = await fromUserAccount.getBalance()
    if(balance < amount) {
        return res.status(400).json({
            message: `Insufficient balance. Current balance is ${balance}.Requested amount is ${amount}` 
        })
    }

    let transaction;
    try {

    /**
     * Step 5: Create a transaction with status pending
     */
    const session = await mongoose.startSession();
    session.startTransaction();

    const transaction =(await  transactionModel.create([{
        fromAccount,
        toAccount,  
        amount,
        idempotencyKey,
        status: "PENDING",
    }], { session }))[0]

    
   

     const debitLadgerEntry = await ladgerModel.create([{
         account: fromAccount,
         amount: amount,
         transaction: transaction._id,
         type: "DEBIT"
     }], { session })
    
     await(()=> {
      return new Promise((resolve) => setTimeout(resolve, 15 * 1000));
        })()

    const creditLadgerEntry = await ladgerModel.create([{
        account: toAccount,
        amount: amount,
        transaction: transaction._id,
        type: "CREDIT"
    }], { session }) 

    await transactionModel.findByIdAndUpdate(
        { _id: transaction._id }, 
        { status: "COMPLETED" },
        { session }
    )
    await session.commitTransaction();
    session.endSession();
    } catch(err) {
    return res.status(500).json({
        message: "Transaction is pending due to some issue. Please try again later",
    error: err.message
    })
}
/**
     * Step 10: Send email notification to sender and receiver
     */

    await emailService.sendTransactionEmail(req.user.email, req.user.name, amount, toAccount)
    return res.status(201).json({
        message: "Transaction completed successfully",
        transaction: transaction
    })
}
   

async function createinitializeFundsTransaction(req,res) {
    const { toAccount, amount, idempotencyKey } = req.body;
    if(!toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "ToAccount, Amount and IdempotencyKey are required to create a transaction",
        })
    }
    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    })
    if(!toUserAccount) {
        return res.status(400).json({
            message: "ToAccount not found"
        })
    }
    const fromUserAccount = await accountModel.findOne({
        user: req.user._id
    })  
    if(!fromUserAccount) {
        return res.status(400).json({
            message: "System user account not found"
        })
    }
    const session = await mongoose.startSession();
    session.startTransaction();

    const transaction = new transactionModel({
        fromAccount: fromUserAccount._id,
        toAccount,
        amount,
        idempotencyKey,
        status: "PENDING"
    }, );
    await transaction.save({ session });

    const debitLadgerEntry = await ladgerModel.create([{
        account: fromUserAccount._id,
        amount: amount,
        transaction: transaction._id,
        type: "DEBIT"
    }], { session })
    const creditLadgerEntry = await ladgerModel.create([{
        account: toAccount,
        amount: amount,
        transaction: transaction._id,
        type: "CREDIT"
    }], { session })

     transaction.status = "COMPLETED"
     await transaction.save({ session })


     await session.commitTransaction();
     session.endSession();

     return res.status(201).json({
        message: "Initial funds transaction completed successfully",
        transaction: transaction
     })
}

module.exports = {
    createTransaction,
    createinitializeFundsTransaction
}
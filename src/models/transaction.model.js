const mongoose = require('mongoose');




const transactionSchema = new mongoose.Schema({
    fromAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "account",
        required: [true, "Transaction must have a source account"],
        index: true
    },
    toAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "account",
        required: [true, "Transaction must have a destination account"],
        index: true
    },
    status: {
        type: String,
        enum : {
            values: ["PENDING", "COMPLETED", "FAILED","REVERSED"],
            message: "Status must be either PENDING, COMPLETED OR FAILED",  
        },
        default: "PENDING"
    },
    amount: {
        type: Number,
        required: [true, "Transaction amount is required for creating a transaction"],
        min: [0, "Transaction amount cannot be negative"]
    },
    idempotencyKey: {
        type: String,
        required: [true, "Idempotency key is required for creating a transaction"],
        index: true,
        unique: true
    }
},{
    timestamps: true

});

const transactionModel = mongoose.model("Transaction", transactionSchema)

module.exports = transactionModel
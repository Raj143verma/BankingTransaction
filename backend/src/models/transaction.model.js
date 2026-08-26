const mongoose = require('mongoose');




const transactionSchema = new mongoose.Schema({
    fromAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
        required: [true, "Transaction must have a source account"],
        index: true
    },
    toAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
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
    },
    reversalReason: {
        type: String,
        trim: true,
        default: null
    },
    reversedAt: {
        type: Date,
        default: null
    },
    reversedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    }
},{
    timestamps: true
});

transactionSchema.index({ fromAccount: 1, createdAt: -1 });
transactionSchema.index({ toAccount: 1, createdAt: -1 });

const transactionModel = mongoose.model("Transaction", transactionSchema)

module.exports = transactionModel
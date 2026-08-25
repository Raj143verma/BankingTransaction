const mongoose = require('mongoose');


const ladgerSchema = new mongoose.Schema({
    account: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "account",
        required: [true, "Ladger entry must be associated with an account"],
        index: true,
        immutable: true
    },
    amount: {
        type: Number,
        required: [true, "Amount is required for creating a ladger entry"],
        immutable: true
    },
    transaction: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "transaction",
        required: [true, "Ladger entry must be associated with a transaction"],
        index: true,
        immutable: true
       
    },
   
    type: {
        type: String,
        enum : {
            values: ["DEBIT", "CREDIT"],
            message: "Transaction type must be either DEBIT or CREDIT",
        },
        required: [true, "Transaction type is required for creating a ladger entry"],
        immutable: true
    }

})

function preventLadgerModification() {
    throw new Error("Ladger entries are immutable and cannot be modified or deleted")
}
ladgerSchema.pre("findOneAndUpdate", preventLadgerModification);
ladgerSchema.pre("updateOne", preventLadgerModification);
ladgerSchema.pre("deleteOne", preventLadgerModification);
ladgerSchema.pre("remove", preventLadgerModification);
ladgerSchema.pre("updateMany", preventLadgerModification);
ladgerSchema.pre("deleteMany", preventLadgerModification);
ladgerSchema.pre("findOneAndDelete", preventLadgerModification);
ladgerSchema.pre("findOneAndReplace", preventLadgerModification);


const ladgerModel = mongoose.model("Ladger", ladgerSchema);

module.exports = ladgerModel;
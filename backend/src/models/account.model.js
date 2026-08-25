const mongoose = require("mongoose");
const ladgerModel = require("./ladger.model");

const accountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Account must be associated with a user"],
      index: true,
    },
    accountHolderName: {
      type: String,
      trim: true,
    },
    accountType: {
      type: String,
      enum: {
        values: ["SAVINGS", "CURRENT"],
        message: "Account type must be either SAVINGS or CURRENT",
      },
      default: "SAVINGS",
    },
    status: {
      type: String,
      enum: {
        values: ["ACTIVE", "INACTIVE", "SUSPENDED"],
        message: "Status must be either ACTIVE, INACTIVE OR SUSPENDED",
      },
      default: "ACTIVE",
    },
    currency: {
      type: String,
      required: [true, "Currency is required for creating an account"],
      default: "INR",
    },
  },
  {
    timestamps: true,
  }
);

accountSchema.index({ user: 1, status: 1 });

accountSchema.methods.getBalance = async function (session) {
  const aggregatePipeline = ladgerModel.aggregate([
    { $match: { account: this._id } },
    {
      $group: {
        _id: null,
        totalDebit: {
          $sum: {
            $cond: [{ $eq: ["$type", "DEBIT"] }, "$amount", 0],
          },
        },
        totalCredit: {
          $sum: {
            $cond: [{ $eq: ["$type", "CREDIT"] }, "$amount", 0],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        balance: { $subtract: ["$totalCredit", "$totalDebit"] },
      },
    },
  ]);

  if (session) {
    aggregatePipeline.session(session);
  }

  const balanceData = await aggregatePipeline;
  if (balanceData.length === 0) {
    return 0;
  }
  return balanceData[0].balance;
};

const accountModel = mongoose.model("Account", accountSchema);

module.exports = accountModel;

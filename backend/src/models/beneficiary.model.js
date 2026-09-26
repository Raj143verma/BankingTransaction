const mongoose = require('mongoose');

const beneficiarySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Beneficiary must belong to a user'],
      index: true,
    },
    sourceAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Beneficiary must be associated with a source account'],
      index: true,
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Beneficiary destination account is required'],
      index: true,
    },
    nickname: {
      type: String,
      required: [true, 'Beneficiary nickname is required'],
      trim: true,
      minlength: [2, 'Nickname must be at least 2 characters'],
      maxlength: [100, 'Nickname cannot exceed 100 characters'],
    },
    accountHolderName: {
      type: String,
      trim: true,
      default: '',
    },
    accountType: {
      type: String,
      trim: true,
      default: 'SAVINGS',
    },
    currency: {
      type: String,
      trim: true,
      default: 'INR',
    },
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'COOLING_OFF', 'INACTIVE', 'BLOCKED'],
        message: 'Status must be ACTIVE, COOLING_OFF, INACTIVE, or BLOCKED',
      },
      default: 'COOLING_OFF',
      index: true,
    },
    maxTransferLimit: {
      type: Number,
      default: null,
      min: [0, 'Beneficiary transfer limit cannot be negative'],
    },
    coolingOffExpiresAt: {
      type: Date,
      default: null,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    deactivatedAt: {
      type: Date,
      default: null,
    },
    removedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index ensuring no duplicate active beneficiaries for same user, source, and destination
beneficiarySchema.index({ user: 1, sourceAccount: 1, account: 1, isDeleted: 1 }, { unique: true });
beneficiarySchema.index({ user: 1, isDeleted: 1, createdAt: -1 });

/**
 * Check if the beneficiary is in an active cooling off period
 */
beneficiarySchema.methods.isCoolingOffActive = function () {
  return this.status === 'COOLING_OFF' && this.coolingOffExpiresAt && new Date(this.coolingOffExpiresAt) > new Date();
};

const beneficiaryModel = mongoose.model('Beneficiary', beneficiarySchema);

module.exports = beneficiaryModel;

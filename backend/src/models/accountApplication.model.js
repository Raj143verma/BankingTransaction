const mongoose = require('mongoose');

const accountApplicationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Application must be associated with a user'],
      index: true,
    },
    fullName: {
      type: String,
      required: [true, 'Full Name is required'],
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: [true, 'Date of Birth is required'],
    },
    gender: {
      type: String,
      required: [true, 'Gender is required'],
      enum: {
        values: ['MALE', 'FEMALE', 'OTHER'],
        message: 'Gender must be MALE, FEMALE, or OTHER',
      },
    },
    mobileNumber: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email address is required'],
      trim: true,
      lowercase: true,
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
    },
    pinCode: {
      type: String,
      required: [true, 'PIN code is required'],
      trim: true,
    },
    idType: {
      type: String,
      required: [true, 'ID Type is required'],
      enum: {
        values: ['AADHAAR', 'PAN', 'PASSPORT', 'VOTER_ID'],
        message: 'ID Type must be AADHAAR, PAN, PASSPORT, or VOTER_ID',
      },
    },
    idNumber: {
      type: String,
      required: [true, 'ID Number is required'],
      trim: true,
    },
    accountType: {
      type: String,
      required: [true, 'Account Type is required'],
      enum: {
        values: ['SAVINGS', 'CURRENT'],
        message: 'Account Type must be SAVINGS or CURRENT',
      },
      default: 'SAVINGS',
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      default: 'INR',
    },
    initialDeposit: {
      type: Number,
      required: [true, 'Initial deposit amount is required'],
      min: [1, 'Initial deposit amount must be greater than zero'],
    },
    status: {
      type: String,
      enum: {
        values: ['PENDING', 'APPROVED', 'REJECTED'],
        message: 'Status must be PENDING, APPROVED, or REJECTED',
      },
      default: 'PENDING',
      index: true,
    },
    createdAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

accountApplicationSchema.index({ user: 1, status: 1 });
accountApplicationSchema.index({ status: 1, createdAt: -1 });

const accountApplicationModel = mongoose.model('AccountApplication', accountApplicationSchema);

module.exports = accountApplicationModel;

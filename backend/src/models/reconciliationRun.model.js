const mongoose = require('mongoose');

const anomalySchema = new mongoose.Schema(
  {
    anomalyType: {
      type: String,
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ['INFO', 'WARNING', 'CRITICAL'],
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      enum: ['ACCOUNT', 'TRANSACTION', 'LEDGER', 'GLOBAL', 'SYSTEM'],
      required: true,
      index: true,
    },
    resourceId: {
      type: String,
      default: null,
      index: true,
    },
    description: {
      type: String,
      required: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const accountSummarySchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    accountHolderName: {
      type: String,
      default: 'Account Holder',
    },
    accountType: {
      type: String,
      default: 'SAVINGS',
    },
    currency: {
      type: String,
      default: 'INR',
    },
    status: {
      type: String,
      default: 'ACTIVE',
    },
    isSystemReserve: {
      type: Boolean,
      default: false,
    },
    totalCredits: {
      type: Number,
      default: 0,
    },
    totalDebits: {
      type: Number,
      default: 0,
    },
    calculatedBalance: {
      type: Number,
      default: 0,
    },
    storedBalance: {
      type: Number,
      default: 0,
    },
    difference: {
      type: Number,
      default: 0,
    },
    isBalanced: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const reconciliationRunSchema = new mongoose.Schema(
  {
    runId: {
      type: String,
      required: [true, 'Run identifier is required'],
      unique: true,
      index: true,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    completedAt: {
      type: Date,
      required: true,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['BALANCED', 'MISMATCH_DETECTED', 'FAILED'],
      required: true,
      default: 'BALANCED',
      index: true,
    },
    isBalanced: {
      type: Boolean,
      default: true,
      index: true,
    },
    totalAccountsChecked: {
      type: Number,
      default: 0,
    },
    totalTransactionsChecked: {
      type: Number,
      default: 0,
    },
    totalLedgerEntriesChecked: {
      type: Number,
      default: 0,
    },
    totalCredits: {
      type: Number,
      default: 0,
    },
    totalDebits: {
      type: Number,
      default: 0,
    },
    difference: {
      type: Number,
      default: 0,
    },
    totalAnomalies: {
      type: Number,
      default: 0,
      index: true,
    },
    criticalAnomalies: {
      type: Number,
      default: 0,
      index: true,
    },
    warningAnomalies: {
      type: Number,
      default: 0,
    },
    infoAnomalies: {
      type: Number,
      default: 0,
    },
    anomalies: [anomalySchema],
    accountSummaries: [accountSummarySchema],
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    summary: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Append-only audit model
    versionKey: false,
  }
);

// Immutability Guard: Reject modifications or deletions on historic reconciliation runs
const blockReconciliationMutation = async function () {
  const err = new Error('Reconciliation run records are immutable and cannot be modified or deleted');
  err.statusCode = 403;
  throw err;
};

reconciliationRunSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'findByIdAndUpdate', 'replaceOne'],
  blockReconciliationMutation
);
reconciliationRunSchema.pre(
  ['deleteOne', 'deleteMany', 'findOneAndDelete', 'findByIdAndDelete'],
  blockReconciliationMutation
);
reconciliationRunSchema.pre('remove', blockReconciliationMutation);
reconciliationRunSchema.pre('save', async function () {
  if (!this.isNew) {
    const err = new Error('Reconciliation run records are immutable and cannot be modified or deleted');
    err.statusCode = 403;
    throw err;
  }
});

// Indexes for administrative historical queries
reconciliationRunSchema.index({ createdAt: -1, _id: -1 });
reconciliationRunSchema.index({ status: 1, createdAt: -1 });
reconciliationRunSchema.index({ initiatedBy: 1, createdAt: -1 });

module.exports = mongoose.model('ReconciliationRun', reconciliationRunSchema);

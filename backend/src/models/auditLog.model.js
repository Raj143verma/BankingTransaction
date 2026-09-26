const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    action: {
      type: String,
      required: [true, 'Action identifier is required'],
      enum: [
        'SYSTEM_LOGIN',
        'SYSTEM_LOGOUT',
        'LOGIN_FAILED',
        'SYSTEM_ACCOUNT_LOCKED',
        'PASSWORD_CHANGED',
        'SESSIONS_REVOKED',
        'APPLICATION_APPROVED',
        'APPLICATION_REJECTED',
        'ACCOUNT_SUSPENDED',
        'ACCOUNT_REACTIVATED',
        'ACCOUNT_DEACTIVATED',
        'TRANSACTION_REVERSED',
        'SYSTEM_FUNDS_INITIALIZED',
        'RECONCILIATION_STARTED',
        'RECONCILIATION_COMPLETED',
        'RECONCILIATION_FAILED',
        'BENEFICIARY_CREATED',
        'BENEFICIARY_ACTIVATED',
        'BENEFICIARY_DEACTIVATED',
        'BENEFICIARY_REMOVED',
        'TRANSFER_LIMIT_EXCEEDED',
        'TRANSFER_BLOCKED',
        'TRANSFER_LIMIT_CONFIG_CHANGED',
      ],
      index: true,
    },
    resourceType: {
      type: String,
      required: [true, 'Resource type is required'],
      enum: ['ACCOUNT', 'ACCOUNT_APPLICATION', 'TRANSACTION', 'USER', 'SYSTEM', 'RECONCILIATION', 'BENEFICIARY', 'TRANSFER_LIMIT_CONFIG'],
      index: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    previousState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    newState: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    reason: {
      type: String,
      trim: true,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Append-only immutable collection
    versionKey: false,
  }
);

// Immutability Guard: Reject any direct update or deletion operations
const blockMutation = async function () {
  const err = new Error('Audit logs are immutable and cannot be modified or deleted');
  err.statusCode = 403;
  throw err;
};

auditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'findByIdAndUpdate', 'replaceOne'], blockMutation);
auditLogSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete', 'findByIdAndDelete'], blockMutation);
auditLogSchema.pre('remove', blockMutation);
auditLogSchema.pre('save', async function () {
  if (!this.isNew) {
    const err = new Error('Audit logs are immutable and cannot be modified or deleted');
    err.statusCode = 403;
    throw err;
  }
});

// Compound Query Indexes for administrative dashboard lookups
auditLogSchema.index({ createdAt: -1, _id: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

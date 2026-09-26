const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient user ID is required'],
      index: true,
    },
    type: {
      type: String,
      required: [true, 'Notification type is required'],
      enum: [
        'TRANSACTION_SENT',
        'TRANSACTION_RECEIVED',
        'TRANSACTION_FAILED',
        'TRANSACTION_REVERSED',
        'APPLICATION_APPROVED',
        'APPLICATION_REJECTED',
        'ACCOUNT_SUSPENDED',
        'ACCOUNT_REACTIVATED',
        'ACCOUNT_DEACTIVATED',
        'SECURITY_LOGIN',
        'SECURITY_LOGIN_FAILED',
        'SECURITY_ACCOUNT_LOCKED',
        'SECURITY_PASSWORD_CHANGED',
        'SECURITY_SESSIONS_REVOKED',
        'SYSTEM_ALERT',
        'SYSTEM_NOTICE',
        'BENEFICIARY_ADDED',
        'BENEFICIARY_ACTIVATED',
        'BENEFICIARY_DEACTIVATED',
        'BENEFICIARY_REMOVED',
        'TRANSFER_LIMIT_EXCEEDED',
        'TRANSFER_BLOCKED',
        'TRANSFER_LIMIT_CONFIG_CHANGED',
      ],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
    },
    severity: {
      type: String,
      required: [true, 'Notification severity is required'],
      enum: ['INFO', 'SUCCESS', 'WARNING', 'ERROR'],
      default: 'INFO',
    },
    relatedResourceType: {
      type: String,
      enum: ['TRANSACTION', 'ACCOUNT', 'ACCOUNT_APPLICATION', 'USER', 'SYSTEM', 'BENEFICIARY', 'TRANSFER_LIMIT_CONFIG', null],
      default: null,
    },
    relatedResourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Append-only historical event log
    versionKey: false,
  }
);

// Compound Query Indexes for fast recipient-scoped lookups
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ relatedResourceType: 1, relatedResourceId: 1 });

// Historical immutability guard: Prevent tampering with notification event content
// Only `isRead` and `readAt` may be modified.
notificationSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'findByIdAndUpdate'], function () {
  const update = this.getUpdate();
  if (update) {
    const forbiddenFields = ['recipient', 'type', 'title', 'message', 'severity', 'relatedResourceType', 'relatedResourceId'];
    const checkObj = update.$set || update;
    for (const field of forbiddenFields) {
      if (checkObj[field] !== undefined) {
        const err = new Error(`Field '${field}' of notification is immutable and cannot be modified`);
        err.statusCode = 400;
        throw err;
      }
    }
  }
});

module.exports = mongoose.model('Notification', notificationSchema);

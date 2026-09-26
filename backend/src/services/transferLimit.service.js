const mongoose = require('mongoose');
const transferLimitConfigModel = require('../models/transferLimitConfig.model');
const transactionModel = require('../models/transaction.model');
const accountModel = require('../models/account.model');
const userModel = require('../models/user.model');
const { logAuditEvent } = require('./auditLog.service');
const notificationService = require('./notification.service');

/**
 * Retrieve the current authoritative transfer limit configuration
 */
async function getTransferLimitConfig(session = null) {
  return await transferLimitConfigModel.getConfig(session);
}

/**
 * Update system-level transfer limit configuration (System User only)
 */
async function updateTransferLimitConfig(updates, adminUser, req = null) {
  const {
    perTransactionLimit,
    dailyAmountLimit,
    dailyCountLimit,
    beneficiaryCooldownMinutes,
  } = updates || {};

  const currentConfig = await getTransferLimitConfig();

  const previousState = {
    perTransactionLimit: currentConfig.perTransactionLimit,
    dailyAmountLimit: currentConfig.dailyAmountLimit,
    dailyCountLimit: currentConfig.dailyCountLimit,
    beneficiaryCooldownMinutes: currentConfig.beneficiaryCooldownMinutes,
  };

  const cleanUpdates = {};

  if (perTransactionLimit !== undefined) {
    const num = Number(perTransactionLimit);
    if (isNaN(num) || num <= 0) {
      const err = new Error('Per-transaction limit must be a positive number');
      err.statusCode = 400;
      throw err;
    }
    cleanUpdates.perTransactionLimit = num;
  }

  if (dailyAmountLimit !== undefined) {
    const num = Number(dailyAmountLimit);
    if (isNaN(num) || num <= 0) {
      const err = new Error('Daily amount limit must be a positive number');
      err.statusCode = 400;
      throw err;
    }
    cleanUpdates.dailyAmountLimit = num;
  }

  if (dailyCountLimit !== undefined) {
    const num = Number(dailyCountLimit);
    if (isNaN(num) || num < 1 || !Number.isInteger(num)) {
      const err = new Error('Daily count limit must be an integer of at least 1');
      err.statusCode = 400;
      throw err;
    }
    cleanUpdates.dailyCountLimit = num;
  }

  if (beneficiaryCooldownMinutes !== undefined) {
    const num = Number(beneficiaryCooldownMinutes);
    if (isNaN(num) || num < 0) {
      const err = new Error('Beneficiary cooldown period must be a non-negative number');
      err.statusCode = 400;
      throw err;
    }
    cleanUpdates.beneficiaryCooldownMinutes = num;
  }

  if (Object.keys(cleanUpdates).length === 0) {
    const err = new Error('No valid transfer limit configuration fields provided for update');
    err.statusCode = 400;
    throw err;
  }

  cleanUpdates.updatedBy = adminUser._id;

  const updatedConfig = await transferLimitConfigModel.findByIdAndUpdate(
    currentConfig._id,
    { $set: cleanUpdates },
    { returnDocument: 'after', runValidators: true }
  );

  const newState = {
    perTransactionLimit: updatedConfig.perTransactionLimit,
    dailyAmountLimit: updatedConfig.dailyAmountLimit,
    dailyCountLimit: updatedConfig.dailyCountLimit,
    beneficiaryCooldownMinutes: updatedConfig.beneficiaryCooldownMinutes,
  };

  // Step 5 Audit Logging
  try {
    await logAuditEvent({
      actor: adminUser._id,
      action: 'TRANSFER_LIMIT_CONFIG_CHANGED',
      resourceType: 'TRANSFER_LIMIT_CONFIG',
      resourceId: updatedConfig._id,
      previousState,
      newState,
      reason: 'System administrator updated transfer limit configuration',
      metadata: {
        changedFields: Object.keys(cleanUpdates),
      },
      req,
    });
  } catch (auditErr) {
    console.error('Failed to log audit event for transfer limit change:', auditErr.message);
  }

  // Step 8 Notifications for System Admins
  try {
    const systemAdmins = await userModel.find({ systemUser: true }).select('_id');
    for (const admin of systemAdmins) {
      await notificationService.createNotification({
        recipient: admin._id,
        type: 'TRANSFER_LIMIT_CONFIG_CHANGED',
        title: 'Transfer Limits Updated',
        message: `System transfer limits were modified by ${adminUser.name || 'System Admin'}.`,
        severity: 'INFO',
        relatedResourceType: 'TRANSFER_LIMIT_CONFIG',
        relatedResourceId: updatedConfig._id,
        metadata: {
          updatedBy: adminUser._id,
          newState,
        },
      });
    }
  } catch (notifErr) {
    console.error('Failed to emit transfer limit config notification:', notifErr.message);
  }

  return updatedConfig;
}

/**
 * Calculate authoritative daily transfer usage for a source account
 *
 * Excludes REVERSED and FAILED transactions automatically.
 */
async function calculateDailyUsage(accountId, session = null) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const query = {
    fromAccount: accountId,
    status: 'COMPLETED',
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  };

  const txs = await transactionModel.find(query, 'amount', session ? { session } : {});

  const dailySpent = txs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  const dailyCount = txs.length;

  return {
    dailySpent,
    dailyCount,
    startOfDay,
    endOfDay,
  };
}

/**
 * Get customer-safe transfer limits and current remaining usage
 */
async function getCustomerLimitSummary(accountId, userId, session = null) {
  const config = await getTransferLimitConfig(session);

  let dailySpent = 0;
  let dailyCount = 0;

  if (accountId && mongoose.Types.ObjectId.isValid(accountId)) {
    // Verify user owns the account
    const account = await accountModel.findOne({ _id: accountId, user: userId }, '_id', session ? { session } : {});
    if (account) {
      const usage = await calculateDailyUsage(account._id, session);
      dailySpent = usage.dailySpent;
      dailyCount = usage.dailyCount;
    }
  } else {
    // Aggregated usage across all user accounts
    const userAccounts = await accountModel.find({ user: userId }, '_id', session ? { session } : {});
    const accountIds = userAccounts.map((a) => a._id);

    if (accountIds.length > 0) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const txs = await transactionModel.find(
        {
          fromAccount: { $in: accountIds },
          status: 'COMPLETED',
          createdAt: { $gte: startOfDay, $lte: endOfDay },
        },
        'amount',
        session ? { session } : {}
      );

      dailySpent = txs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      dailyCount = txs.length;
    }
  }

  const remainingDailyAmount = Math.max(0, config.dailyAmountLimit - dailySpent);
  const remainingDailyCount = Math.max(0, config.dailyCountLimit - dailyCount);

  return {
    perTransactionLimit: config.perTransactionLimit,
    dailyAmountLimit: config.dailyAmountLimit,
    dailyCountLimit: config.dailyCountLimit,
    beneficiaryCooldownMinutes: config.beneficiaryCooldownMinutes,
    dailySpent,
    remainingDailyAmount,
    dailyCount,
    remainingDailyCount,
  };
}

module.exports = {
  getTransferLimitConfig,
  updateTransferLimitConfig,
  calculateDailyUsage,
  getCustomerLimitSummary,
};

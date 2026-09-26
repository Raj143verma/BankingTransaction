const mongoose = require('mongoose');
const beneficiaryModel = require('../models/beneficiary.model');
const accountModel = require('../models/account.model');
const userModel = require('../models/user.model');
const transferLimitConfigModel = require('../models/transferLimitConfig.model');
const { logAuditEvent } = require('./auditLog.service');
const notificationService = require('./notification.service');

/**
 * Create a new beneficiary for an authenticated customer
 */
async function createBeneficiary(params) {
  const {
    user,
    sourceAccountId,
    targetAccountId,
    nickname,
    maxTransferLimit = null,
    req = null,
  } = params || {};

  if (!user || !user._id) {
    const err = new Error('Authenticated user is required');
    err.statusCode = 401;
    throw err;
  }

  if (!sourceAccountId || !targetAccountId || !nickname) {
    const err = new Error('Source account, destination account, and nickname are required');
    err.statusCode = 400;
    throw err;
  }

  if (!mongoose.Types.ObjectId.isValid(sourceAccountId)) {
    const err = new Error('Invalid source account ID');
    err.statusCode = 400;
    throw err;
  }

  if (!mongoose.Types.ObjectId.isValid(targetAccountId)) {
    const err = new Error('Invalid destination account ID');
    err.statusCode = 400;
    throw err;
  }

  const trimmedNickname = String(nickname).trim();
  if (trimmedNickname.length < 2 || trimmedNickname.length > 100) {
    const err = new Error('Beneficiary nickname must be between 2 and 100 characters');
    err.statusCode = 400;
    throw err;
  }

  // 1. Validate source account ownership and status
  const sourceAccount = await accountModel.findById(sourceAccountId);
  if (!sourceAccount) {
    const err = new Error('Source account not found');
    err.statusCode = 404;
    throw err;
  }

  if (sourceAccount.user.toString() !== user._id.toString()) {
    const err = new Error('Unauthorized: You do not own the source account');
    err.statusCode = 403;
    throw err;
  }

  if (sourceAccount.status !== 'ACTIVE') {
    const err = new Error(`Source account is ${sourceAccount.status}. Only ACTIVE accounts can add beneficiaries.`);
    err.statusCode = 400;
    throw err;
  }

  // 2. Validate destination / beneficiary account
  const targetAccount = await accountModel.findById(targetAccountId).populate('user', 'name email');
  if (!targetAccount) {
    const err = new Error('Destination beneficiary account not found');
    err.statusCode = 404;
    throw err;
  }

  if (targetAccount.status !== 'ACTIVE') {
    const err = new Error(`Cannot add beneficiary: destination account is ${targetAccount.status}`);
    err.statusCode = 400;
    throw err;
  }

  // 3. Prevent self-beneficiary (same account or same user)
  if (targetAccount._id.toString() === sourceAccount._id.toString()) {
    const err = new Error('Cannot add source account as its own beneficiary');
    err.statusCode = 400;
    throw err;
  }

  const targetUserId = targetAccount.user?._id ? targetAccount.user._id.toString() : targetAccount.user?.toString();
  if (targetUserId === user._id.toString()) {
    const err = new Error('Cannot add your own account as a beneficiary. Please use direct internal transfer.');
    err.statusCode = 400;
    throw err;
  }

  // 4. Validate custom maxTransferLimit if supplied
  let parsedLimit = null;
  if (maxTransferLimit !== undefined && maxTransferLimit !== null && maxTransferLimit !== '') {
    parsedLimit = Number(maxTransferLimit);
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      const err = new Error('Beneficiary transfer limit must be a positive number');
      err.statusCode = 400;
      throw err;
    }
  }

  // 5. Prevent duplicate active beneficiary
  const existingBeneficiary = await beneficiaryModel.findOne({
    user: user._id,
    sourceAccount: sourceAccountId,
    account: targetAccountId,
    isDeleted: false,
  });

  if (existingBeneficiary) {
    const err = new Error('An active beneficiary for this source and destination account already exists');
    err.statusCode = 409;
    throw err;
  }

  // 6. Calculate cooldown / activation status
  const config = await transferLimitConfigModel.getConfig();
  const cooldownMinutes = typeof config.beneficiaryCooldownMinutes === 'number'
    ? config.beneficiaryCooldownMinutes
    : 30;

  let status = 'ACTIVE';
  let coolingOffExpiresAt = null;
  let activatedAt = new Date();

  if (cooldownMinutes > 0) {
    status = 'COOLING_OFF';
    coolingOffExpiresAt = new Date(Date.now() + cooldownMinutes * 60 * 1000);
    activatedAt = null;
  }

  const accountHolderName = targetAccount.accountHolderName || targetAccount.user?.name || 'Account Holder';

  // 7. Create Beneficiary Document
  const beneficiary = await beneficiaryModel.create({
    user: user._id,
    sourceAccount: sourceAccountId,
    account: targetAccountId,
    nickname: trimmedNickname,
    accountHolderName,
    accountType: targetAccount.accountType || 'SAVINGS',
    currency: targetAccount.currency || 'INR',
    status,
    maxTransferLimit: parsedLimit,
    coolingOffExpiresAt,
    activatedAt,
    isDeleted: false,
  });

  // Step 5 Audit Logging
  try {
    await logAuditEvent({
      actor: user._id,
      action: 'BENEFICIARY_CREATED',
      resourceType: 'BENEFICIARY',
      resourceId: beneficiary._id,
      previousState: null,
      newState: {
        nickname: beneficiary.nickname,
        sourceAccount: beneficiary.sourceAccount,
        account: beneficiary.account,
        status: beneficiary.status,
        coolingOffExpiresAt: beneficiary.coolingOffExpiresAt,
        maxTransferLimit: beneficiary.maxTransferLimit,
      },
      reason: 'Customer added new beneficiary',
      metadata: {
        nickname: beneficiary.nickname,
        sourceAccount: beneficiary.sourceAccount,
        account: beneficiary.account,
      },
      req,
    });
  } catch (auditErr) {
    console.error('Failed to log audit event for beneficiary creation:', auditErr.message);
  }

  // Step 8 Notifications
  try {
    const cooldownMsg = cooldownMinutes > 0
      ? ` It is in a ${cooldownMinutes}-minute cooling-off period until ${coolingOffExpiresAt.toLocaleTimeString()}.`
      : '';

    await notificationService.createNotification({
      recipient: user._id,
      type: 'BENEFICIARY_ADDED',
      title: 'Beneficiary Added',
      message: `Beneficiary '${beneficiary.nickname}' (${targetAccountId}) has been successfully added.${cooldownMsg}`,
      severity: 'SUCCESS',
      relatedResourceType: 'BENEFICIARY',
      relatedResourceId: beneficiary._id,
      metadata: {
        beneficiaryId: beneficiary._id,
        nickname: beneficiary.nickname,
        account: targetAccountId,
        status: beneficiary.status,
      },
    });
  } catch (notifErr) {
    console.error('Failed to emit beneficiary notification:', notifErr.message);
  }

  return beneficiary;
}

/**
 * List all non-deleted beneficiaries owned by the authenticated customer
 */
async function getBeneficiaries(userId, filterParams = {}) {
  const beneficiaries = await beneficiaryModel
    .find({ user: userId, isDeleted: false })
    .populate('sourceAccount', '_id accountHolderName currency status')
    .populate('account', '_id accountHolderName currency status accountType')
    .sort({ createdAt: -1 });

  // Auto-progress any cooling-off beneficiaries whose cooldown has elapsed
  const now = new Date();
  const updatedList = [];

  for (const b of beneficiaries) {
    if (b.status === 'COOLING_OFF' && b.coolingOffExpiresAt && new Date(b.coolingOffExpiresAt) <= now) {
      b.status = 'ACTIVE';
      b.activatedAt = b.activatedAt || now;
      await beneficiaryModel.findByIdAndUpdate(b._id, {
        $set: { status: 'ACTIVE', activatedAt: b.activatedAt },
      });
    }
    updatedList.push(b);
  }

  return updatedList;
}

/**
 * Retrieve a specific beneficiary with strict IDOR ownership verification
 */
async function getBeneficiaryById(userId, beneficiaryId) {
  if (!mongoose.Types.ObjectId.isValid(beneficiaryId)) {
    const err = new Error('Invalid beneficiary ID format');
    err.statusCode = 400;
    throw err;
  }

  const beneficiary = await beneficiaryModel
    .findOne({ _id: beneficiaryId, user: userId, isDeleted: false })
    .populate('sourceAccount', '_id accountHolderName currency status')
    .populate('account', '_id accountHolderName currency status accountType');

  if (!beneficiary) {
    const err = new Error('Beneficiary not found or access denied');
    err.statusCode = 404;
    throw err;
  }

  // Auto-progress cooling off if expired
  if (beneficiary.status === 'COOLING_OFF' && beneficiary.coolingOffExpiresAt && new Date(beneficiary.coolingOffExpiresAt) <= new Date()) {
    beneficiary.status = 'ACTIVE';
    beneficiary.activatedAt = beneficiary.activatedAt || new Date();
    await beneficiaryModel.findByIdAndUpdate(beneficiary._id, {
      $set: { status: 'ACTIVE', activatedAt: beneficiary.activatedAt },
    });
  }

  return beneficiary;
}

/**
 * Activate a beneficiary (if cooldown expired or when reactivating inactive)
 */
async function activateBeneficiary(userId, beneficiaryId, req = null) {
  if (!mongoose.Types.ObjectId.isValid(beneficiaryId)) {
    const err = new Error('Invalid beneficiary ID');
    err.statusCode = 400;
    throw err;
  }

  const beneficiary = await beneficiaryModel.findOne({
    _id: beneficiaryId,
    user: userId,
    isDeleted: false,
  });

  if (!beneficiary) {
    const err = new Error('Beneficiary not found or access denied');
    err.statusCode = 404;
    throw err;
  }

  if (beneficiary.status === 'ACTIVE') {
    return beneficiary;
  }

  if (beneficiary.status === 'COOLING_OFF' && beneficiary.coolingOffExpiresAt && new Date(beneficiary.coolingOffExpiresAt) > new Date()) {
    const remainingMs = new Date(beneficiary.coolingOffExpiresAt) - new Date();
    const remainingMins = Math.ceil(remainingMs / 60000);
    const err = new Error(`Cannot activate beneficiary: Cooling-off period is still active (${remainingMins} minute(s) remaining until ${new Date(beneficiary.coolingOffExpiresAt).toLocaleTimeString()})`);
    err.statusCode = 400;
    throw err;
  }

  const previousState = { status: beneficiary.status, activatedAt: beneficiary.activatedAt };
  beneficiary.status = 'ACTIVE';
  beneficiary.activatedAt = new Date();
  await beneficiary.save();

  // Step 5 Audit Logging
  try {
    await logAuditEvent({
      actor: userId,
      action: 'BENEFICIARY_ACTIVATED',
      resourceType: 'BENEFICIARY',
      resourceId: beneficiary._id,
      previousState,
      newState: { status: 'ACTIVE', activatedAt: beneficiary.activatedAt },
      reason: 'Beneficiary activated',
      metadata: { nickname: beneficiary.nickname, account: beneficiary.account },
      req,
    });
  } catch (auditErr) {
    console.error('Failed to log audit event for beneficiary activation:', auditErr.message);
  }

  // Step 8 Notification
  try {
    await notificationService.createNotification({
      recipient: userId,
      type: 'BENEFICIARY_ACTIVATED',
      title: 'Beneficiary Activated',
      message: `Beneficiary '${beneficiary.nickname}' is now active and ready for transfers.`,
      severity: 'SUCCESS',
      relatedResourceType: 'BENEFICIARY',
      relatedResourceId: beneficiary._id,
      metadata: { beneficiaryId: beneficiary._id, nickname: beneficiary.nickname },
    });
  } catch (notifErr) {
    console.error('Failed to emit beneficiary activation notification:', notifErr.message);
  }

  return beneficiary;
}

/**
 * Deactivate an active beneficiary
 */
async function deactivateBeneficiary(userId, beneficiaryId, req = null) {
  if (!mongoose.Types.ObjectId.isValid(beneficiaryId)) {
    const err = new Error('Invalid beneficiary ID');
    err.statusCode = 400;
    throw err;
  }

  const beneficiary = await beneficiaryModel.findOne({
    _id: beneficiaryId,
    user: userId,
    isDeleted: false,
  });

  if (!beneficiary) {
    const err = new Error('Beneficiary not found or access denied');
    err.statusCode = 404;
    throw err;
  }

  const previousState = { status: beneficiary.status, deactivatedAt: beneficiary.deactivatedAt };
  beneficiary.status = 'INACTIVE';
  beneficiary.deactivatedAt = new Date();
  await beneficiary.save();

  // Step 5 Audit Logging
  try {
    await logAuditEvent({
      actor: userId,
      action: 'BENEFICIARY_DEACTIVATED',
      resourceType: 'BENEFICIARY',
      resourceId: beneficiary._id,
      previousState,
      newState: { status: 'INACTIVE', deactivatedAt: beneficiary.deactivatedAt },
      reason: 'Beneficiary deactivated by customer',
      metadata: { nickname: beneficiary.nickname, account: beneficiary.account },
      req,
    });
  } catch (auditErr) {
    console.error('Failed to log audit event for beneficiary deactivation:', auditErr.message);
  }

  // Step 8 Notification
  try {
    await notificationService.createNotification({
      recipient: userId,
      type: 'BENEFICIARY_DEACTIVATED',
      title: 'Beneficiary Deactivated',
      message: `Beneficiary '${beneficiary.nickname}' has been deactivated.`,
      severity: 'WARNING',
      relatedResourceType: 'BENEFICIARY',
      relatedResourceId: beneficiary._id,
      metadata: { beneficiaryId: beneficiary._id, nickname: beneficiary.nickname },
    });
  } catch (notifErr) {
    console.error('Failed to emit beneficiary deactivation notification:', notifErr.message);
  }

  return beneficiary;
}

/**
 * Remove (soft-delete) a beneficiary
 */
async function removeBeneficiary(userId, beneficiaryId, req = null) {
  if (!mongoose.Types.ObjectId.isValid(beneficiaryId)) {
    const err = new Error('Invalid beneficiary ID');
    err.statusCode = 400;
    throw err;
  }

  const beneficiary = await beneficiaryModel.findOne({
    _id: beneficiaryId,
    user: userId,
    isDeleted: false,
  });

  if (!beneficiary) {
    const err = new Error('Beneficiary not found or access denied');
    err.statusCode = 404;
    throw err;
  }

  const previousState = { isDeleted: false, status: beneficiary.status };
  beneficiary.isDeleted = true;
  beneficiary.removedAt = new Date();
  beneficiary.status = 'INACTIVE';
  await beneficiary.save();

  // Step 5 Audit Logging
  try {
    await logAuditEvent({
      actor: userId,
      action: 'BENEFICIARY_REMOVED',
      resourceType: 'BENEFICIARY',
      resourceId: beneficiary._id,
      previousState,
      newState: { isDeleted: true, status: 'INACTIVE', removedAt: beneficiary.removedAt },
      reason: 'Beneficiary removed by customer',
      metadata: { nickname: beneficiary.nickname, account: beneficiary.account },
      req,
    });
  } catch (auditErr) {
    console.error('Failed to log audit event for beneficiary removal:', auditErr.message);
  }

  // Step 8 Notification
  try {
    await notificationService.createNotification({
      recipient: userId,
      type: 'BENEFICIARY_REMOVED',
      title: 'Beneficiary Removed',
      message: `Beneficiary '${beneficiary.nickname}' has been removed from your account.`,
      severity: 'INFO',
      relatedResourceType: 'BENEFICIARY',
      relatedResourceId: beneficiary._id,
      metadata: { beneficiaryId: beneficiary._id, nickname: beneficiary.nickname },
    });
  } catch (notifErr) {
    console.error('Failed to emit beneficiary removal notification:', notifErr.message);
  }

  return { message: 'Beneficiary removed successfully', beneficiaryId: beneficiary._id };
}

/**
 * Update permitted beneficiary fields (nickname, maxTransferLimit)
 */
async function updateBeneficiary(userId, beneficiaryId, updateData, req = null) {
  if (!mongoose.Types.ObjectId.isValid(beneficiaryId)) {
    const err = new Error('Invalid beneficiary ID');
    err.statusCode = 400;
    throw err;
  }

  const beneficiary = await beneficiaryModel.findOne({
    _id: beneficiaryId,
    user: userId,
    isDeleted: false,
  });

  if (!beneficiary) {
    const err = new Error('Beneficiary not found or access denied');
    err.statusCode = 404;
    throw err;
  }

  const cleanUpdates = {};

  if (updateData.nickname !== undefined) {
    const trimmed = String(updateData.nickname).trim();
    if (trimmed.length < 2 || trimmed.length > 100) {
      const err = new Error('Beneficiary nickname must be between 2 and 100 characters');
      err.statusCode = 400;
      throw err;
    }
    cleanUpdates.nickname = trimmed;
  }

  if (updateData.maxTransferLimit !== undefined) {
    if (updateData.maxTransferLimit === null || updateData.maxTransferLimit === '') {
      cleanUpdates.maxTransferLimit = null;
    } else {
      const limit = Number(updateData.maxTransferLimit);
      if (isNaN(limit) || limit <= 0) {
        const err = new Error('Beneficiary transfer limit must be a positive number');
        err.statusCode = 400;
        throw err;
      }
      cleanUpdates.maxTransferLimit = limit;
    }
  }

  if (Object.keys(cleanUpdates).length === 0) {
    const err = new Error('No valid beneficiary fields provided for update');
    err.statusCode = 400;
    throw err;
  }

  const updatedBeneficiary = await beneficiaryModel.findByIdAndUpdate(
    beneficiary._id,
    { $set: cleanUpdates },
    { returnDocument: 'after' }
  );

  return updatedBeneficiary;
}

module.exports = {
  createBeneficiary,
  getBeneficiaries,
  getBeneficiaryById,
  activateBeneficiary,
  deactivateBeneficiary,
  removeBeneficiary,
  updateBeneficiary,
};

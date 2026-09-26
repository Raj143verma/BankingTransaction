const mongoose = require('mongoose');
const notificationModel = require('../models/notification.model');

/**
 * Recursively strip sensitive credentials from notification metadata
 */
function sanitizeMetadata(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeMetadata);
  }
  const clean = {};
  const SENSITIVE_KEYS = [
    'password',
    'newpassword',
    'currentpassword',
    'token',
    'jwt',
    'secret',
    'authorization',
    'cookie',
    'cookies',
  ];

  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
      continue; // Skip sensitive keys
    }
    if (val && typeof val === 'object') {
      clean[key] = sanitizeMetadata(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

/**
 * Create a single notification for a recipient user
 *
 * @param {Object} params
 * @param {string|mongoose.Types.ObjectId} params.recipient - User ID
 * @param {string} params.type - Enum notification type
 * @param {string} params.title - Notification title
 * @param {string} params.message - Notification message
 * @param {string} [params.severity='INFO'] - 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'
 * @param {string} [params.relatedResourceType] - 'TRANSACTION' | 'ACCOUNT' | 'ACCOUNT_APPLICATION' | 'USER' | 'SYSTEM'
 * @param {string|mongoose.Types.ObjectId} [params.relatedResourceId] - Target document ID
 * @param {Object} [params.metadata] - Safe metadata
 * @param {Date} [params.expiresAt] - Expiry timestamp
 * @param {mongoose.ClientSession} [session] - Optional active MongoDB session
 * @returns {Promise<Object>} Created notification document
 */
async function createNotification(params, session = null) {
  const {
    recipient,
    type,
    title,
    message,
    severity = 'INFO',
    relatedResourceType = null,
    relatedResourceId = null,
    metadata = {},
    expiresAt = null,
  } = params || {};

  if (!recipient) {
    throw new Error('Recipient is required to create a notification');
  }

  const doc = {
    recipient: new mongoose.Types.ObjectId(recipient.toString()),
    type,
    title: String(title || '').trim(),
    message: String(message || '').trim(),
    severity: ['INFO', 'SUCCESS', 'WARNING', 'ERROR'].includes(severity) ? severity : 'INFO',
    relatedResourceType: relatedResourceType || null,
    relatedResourceId: relatedResourceId ? new mongoose.Types.ObjectId(relatedResourceId.toString()) : null,
    metadata: sanitizeMetadata(metadata),
    isRead: false,
    readAt: null,
    expiresAt: expiresAt || null,
  };

  const createOptions = session ? { session } : {};
  const result = await notificationModel.create([doc], createOptions);
  return result[0];
}

/**
 * Batch create multiple notifications safely
 *
 * @param {Array<Object>} notificationsList
 * @param {mongoose.ClientSession} [session]
 * @returns {Promise<Array<Object>>}
 */
async function createNotifications(notificationsList, session = null) {
  if (!Array.isArray(notificationsList) || notificationsList.length === 0) {
    return [];
  }

  const docs = notificationsList.map((item) => ({
    recipient: new mongoose.Types.ObjectId(item.recipient.toString()),
    type: item.type,
    title: String(item.title || '').trim(),
    message: String(item.message || '').trim(),
    severity: ['INFO', 'SUCCESS', 'WARNING', 'ERROR'].includes(item.severity) ? item.severity : 'INFO',
    relatedResourceType: item.relatedResourceType || null,
    relatedResourceId: item.relatedResourceId ? new mongoose.Types.ObjectId(item.relatedResourceId.toString()) : null,
    metadata: sanitizeMetadata(item.metadata || {}),
    isRead: false,
    readAt: null,
    expiresAt: item.expiresAt || null,
  }));

  const createOptions = session ? { session } : {};
  return await notificationModel.create(docs, createOptions);
}

/**
 * Retrieve paginated notifications for a recipient user
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @param {Object} [options]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=20]
 * @param {boolean|string} [options.isRead]
 * @param {string} [options.type]
 * @param {string} [options.severity]
 * @returns {Promise<{ notifications: Array, pagination: Object }>}
 */
async function getUserNotifications(userId, options = {}) {
  const recipientId = new mongoose.Types.ObjectId(userId.toString());
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const query = { recipient: recipientId };

  if (options.isRead !== undefined && options.isRead !== null && options.isRead !== '') {
    query.isRead = options.isRead === true || options.isRead === 'true';
  }

  if (options.type && typeof options.type === 'string' && options.type.trim()) {
    query.type = options.type.trim();
  }

  if (options.severity && typeof options.severity === 'string' && options.severity.trim()) {
    query.severity = options.severity.trim().toUpperCase();
  }

  const [notifications, totalCount, unreadCount] = await Promise.all([
    notificationModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    notificationModel.countDocuments(query),
    notificationModel.countDocuments({ recipient: recipientId, isRead: false }),
  ]);

  const totalPages = Math.ceil(totalCount / limit) || 1;

  return {
    notifications,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
      unreadCount,
    },
  };
}

/**
 * Get unread notification count for a user
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Promise<{ count: number }>}
 */
async function getUnreadCount(userId) {
  const recipientId = new mongoose.Types.ObjectId(userId.toString());
  const count = await notificationModel.countDocuments({ recipient: recipientId, isRead: false });
  return { count };
}

/**
 * Mark a single notification as read for a specific recipient user
 *
 * @param {string|mongoose.Types.ObjectId} notificationId
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Promise<Object>}
 */
async function markAsRead(notificationId, userId) {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    const err = new Error('Invalid notification ID');
    err.statusCode = 400;
    throw err;
  }

  const notifId = new mongoose.Types.ObjectId(notificationId.toString());
  const recipientId = new mongoose.Types.ObjectId(userId.toString());

  // Find notification by ID first to distinguish between 404 (not found / not owned) vs success
  const existing = await notificationModel.findById(notifId);
  if (!existing || existing.recipient.toString() !== recipientId.toString()) {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }

  if (existing.isRead) {
    return existing;
  }

  existing.isRead = true;
  existing.readAt = new Date();
  await existing.save();

  return existing;
}

/**
 * Mark all unread notifications as read for a specific recipient user
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Promise<{ modifiedCount: number }>}
 */
async function markAllAsRead(userId) {
  const recipientId = new mongoose.Types.ObjectId(userId.toString());
  const now = new Date();

  const result = await notificationModel.updateMany(
    { recipient: recipientId, isRead: false },
    { $set: { isRead: true, readAt: now } }
  );

  return {
    modifiedCount: result.modifiedCount || 0,
  };
}

/**
 * Delete a single notification owned by a user
 *
 * @param {string|mongoose.Types.ObjectId} notificationId
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Promise<boolean>}
 */
async function deleteNotification(notificationId, userId) {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    const err = new Error('Invalid notification ID');
    err.statusCode = 400;
    throw err;
  }

  const notifId = new mongoose.Types.ObjectId(notificationId.toString());
  const recipientId = new mongoose.Types.ObjectId(userId.toString());

  const notification = await notificationModel.findOne({ _id: notifId, recipient: recipientId });
  if (!notification) {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }

  await notificationModel.deleteOne({ _id: notifId });
  return true;
}

module.exports = {
  sanitizeMetadata,
  createNotification,
  createNotifications,
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};

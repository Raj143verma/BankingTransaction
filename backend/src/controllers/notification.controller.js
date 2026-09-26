const mongoose = require('mongoose');
const notificationService = require('../services/notification.service');

/**
 * GET /api/notifications
 * Retrieve paginated notifications for the authenticated user
 */
async function getNotificationsController(req, res, next) {
  try {
    const { page, limit, isRead, type, severity } = req.query || {};

    const result = await notificationService.getUserNotifications(req.user._id, {
      page,
      limit,
      isRead,
      type,
      severity,
    });

    return res.status(200).json({
      status: 'success',
      notifications: result.notifications,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/notifications/unread-count
 * Retrieve unread notification count for the authenticated user
 */
async function getUnreadCountController(req, res, next) {
  try {
    const result = await notificationService.getUnreadCount(req.user._id);

    return res.status(200).json({
      status: 'success',
      count: result.count,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read for the authenticated user
 */
async function markNotificationAsReadController(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid notification ID',
      });
    }

    const updated = await notificationService.markAsRead(id, req.user._id);

    return res.status(200).json({
      status: 'success',
      message: 'Notification marked as read',
      notification: updated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/notifications/read-all
 * Mark all unread notifications as read for the authenticated user
 */
async function markAllNotificationsAsReadController(req, res, next) {
  try {
    const result = await notificationService.markAllAsRead(req.user._id);

    return res.status(200).json({
      status: 'success',
      message: 'All notifications marked as read',
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/notifications/:id
 * Delete a notification owned by the authenticated user
 */
async function deleteNotificationController(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid notification ID',
      });
    }

    await notificationService.deleteNotification(id, req.user._id);

    return res.status(200).json({
      status: 'success',
      message: 'Notification deleted successfully',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotificationsController,
  getUnreadCountController,
  markNotificationAsReadController,
  markAllNotificationsAsReadController,
  deleteNotificationController,
};

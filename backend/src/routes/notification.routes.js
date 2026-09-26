const express = require('express');
const { authMiddleware } = require('../middleware/auth.middleware');
const {
  getNotificationsController,
  getUnreadCountController,
  markNotificationAsReadController,
  markAllNotificationsAsReadController,
  deleteNotificationController,
} = require('../controllers/notification.controller');

const router = express.Router();

// All notification endpoints require valid authenticated session
router.use(authMiddleware);

router.get('/', getNotificationsController);
router.get('/unread-count', getUnreadCountController);
router.patch('/read-all', markAllNotificationsAsReadController);
router.patch('/:id/read', markNotificationAsReadController);
router.delete('/:id', deleteNotificationController);

module.exports = router;

import api from './api';

export const notificationService = {
  /**
   * Fetch paginated notifications with optional filter parameters
   * @param {Object} [params] - { page, limit, isRead, type, severity }
   */
  async getNotifications(params = {}) {
    const response = await api.get('/notifications', { params });
    return response.data;
  },

  /**
   * Fetch current unread notification count
   */
  async getUnreadCount() {
    const response = await api.get('/notifications/unread-count');
    return response.data;
  },

  /**
   * Mark a single notification as read
   * @param {string} id - Notification ID
   */
  async markAsRead(id) {
    const response = await api.patch(`/notifications/${id}/read`);
    return response.data;
  },

  /**
   * Mark all unread notifications as read
   */
  async markAllAsRead() {
    const response = await api.patch('/notifications/read-all');
    return response.data;
  },

  /**
   * Delete a notification
   * @param {string} id - Notification ID
   */
  async deleteNotification(id) {
    const response = await api.delete(`/notifications/${id}`);
    return response.data;
  },
};

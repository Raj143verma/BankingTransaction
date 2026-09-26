import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationService } from '../services/notification.service';

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'unread'
  const [error, setError] = useState(null);

  const containerRef = useRef(null);
  const navigate = useNavigate();

  // Format timestamp helper
  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await notificationService.getUnreadCount();
      setUnreadCount(data.count || 0);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, []);

  // Fetch notifications
  const fetchNotifications = useCallback(async (tab = activeTab) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        limit: 30,
        page: 1,
      };
      if (tab === 'unread') {
        params.isRead = false;
      }
      const data = await notificationService.getNotifications(params);
      setNotifications(data.notifications || []);
      if (data.pagination && data.pagination.unreadCount !== undefined) {
        setUnreadCount(data.pagination.unreadCount);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
      setError('Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  // Initial fetch and polling
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // 30s polling
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Refetch when dropdown opens or activeTab changes
  useEffect(() => {
    if (isOpen) {
      fetchNotifications(activeTab);
    }
  }, [isOpen, activeTab, fetchNotifications]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const toggleDropdown = () => {
    setIsOpen((prev) => !prev);
  };

  const handleMarkAsRead = async (e, id) => {
    e.stopPropagation();
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
      if (activeTab === 'unread') {
        setNotifications([]);
      }
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleDeleteNotification = async (e, id) => {
    e.stopPropagation();
    try {
      await notificationService.deleteNotification(id);
      const deleted = notifications.find((n) => n._id === id);
      setNotifications((prev) => prev.filter((n) => n._id !== id));
      if (deleted && !deleted.isRead) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleNotificationClick = (notif) => {
    if (!notif.isRead) {
      handleMarkAsRead({ stopPropagation: () => {} }, notif._id);
    }

    setIsOpen(false);

    // Route to relevant page if applicable
    if (notif.relatedResourceType === 'TRANSACTION') {
      navigate('/transactions');
    } else if (notif.relatedResourceType === 'ACCOUNT') {
      navigate('/accounts');
    } else if (notif.relatedResourceType === 'ACCOUNT_APPLICATION') {
      navigate('/accounts/applications');
    } else if (notif.relatedResourceType === 'USER') {
      navigate('/security');
    }
  };

  const getSeverityBadgeClass = (severity) => {
    switch (severity) {
      case 'SUCCESS':
        return 'badge-success';
      case 'WARNING':
        return 'badge-warning';
      case 'ERROR':
        return 'badge-danger';
      case 'INFO':
      default:
        return 'badge-info';
    }
  };

  return (
    <div className="notification-center-wrapper" ref={containerRef}>
      <button
        type="button"
        className={`notification-bell-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={toggleDropdown}
        aria-label="Notifications"
        title="Notifications"
      >
        <svg
          className="bell-icon"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span className="unread-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <div className="header-title-row">
              <h4 className="notification-title">Notifications</h4>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="btn-link-action"
                  onClick={handleMarkAllAsRead}
                >
                  Mark all as read
                </button>
              )}
            </div>

            <div className="notification-tabs">
              <button
                type="button"
                className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'unread' ? 'active' : ''}`}
                onClick={() => setActiveTab('unread')}
              >
                Unread {unreadCount > 0 && `(${unreadCount})`}
              </button>
            </div>
          </div>

          <div className="notification-list-container">
            {loading ? (
              <div className="notification-loading">
                <div className="mini-spinner" />
                <span>Loading notifications...</span>
              </div>
            ) : error ? (
              <div className="notification-error">
                <p>{error}</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => fetchNotifications(activeTab)}
                >
                  Retry
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="notification-empty">
                <svg
                  viewBox="0 0 24 24"
                  width="36"
                  height="36"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                  className="empty-icon"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                <p className="empty-text">No notifications found</p>
                <span className="empty-subtext">You're all caught up!</span>
              </div>
            ) : (
              <div className="notification-items">
                {notifications.map((notif) => (
                  <div
                    key={notif._id}
                    className={`notification-item ${notif.isRead ? 'read' : 'unread'}`}
                    onClick={() => handleNotificationClick(notif)}
                  >
                    <div className="item-status-indicator">
                      {!notif.isRead && <span className="unread-dot" />}
                    </div>

                    <div className="item-content">
                      <div className="item-top-row">
                        <span className={`badge ${getSeverityBadgeClass(notif.severity)}`}>
                          {notif.severity}
                        </span>
                        <span className="item-time">{formatTime(notif.createdAt)}</span>
                      </div>

                      <h5 className="item-heading">{notif.title}</h5>
                      <p className="item-message">{notif.message}</p>
                    </div>

                    <div className="item-actions">
                      {!notif.isRead && (
                        <button
                          type="button"
                          className="btn-icon-action"
                          title="Mark as read"
                          onClick={(e) => handleMarkAsRead(e, notif._id)}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="14"
                            height="14"
                            stroke="currentColor"
                            strokeWidth="2"
                            fill="none"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-icon-action btn-delete-action"
                        title="Dismiss"
                        onClick={(e) => handleDeleteNotification(e, notif._id)}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="14"
                          height="14"
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

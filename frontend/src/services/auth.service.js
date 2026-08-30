import api from './api';

export const authService = {
  /**
   * Fetch currently authenticated user's session profile
   * GET /api/auth/me
   */
  async getMe() {
    const response = await api.get('/auth/me');
    return response.data;
  },

  /**
   * Log in user with email and password
   * POST /api/auth/login
   */
  async login(credentials) {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  /**
   * Register new user
   * POST /api/auth/register
   */
  async register(userData) {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  /**
   * Log out user and invalidate cookie/token
   * POST /api/auth/logout
   */
  async logout() {
    const response = await api.post('/auth/logout');
    return response.data;
  },

  /**
   * Change user password securely and revoke old session tokens
   * POST /api/auth/change-password
   */
  async changePassword(data) {
    const response = await api.post('/auth/change-password', data);
    return response.data;
  },

  /**
   * Revoke all other active user sessions by bumping sessionVersion
   * POST /api/auth/revoke-sessions
   */
  async revokeSessions() {
    const response = await api.post('/auth/revoke-sessions');
    return response.data;
  },

  /**
   * Fetch safe session and security status
   * GET /api/auth/session-status
   */
  async getSessionStatus() {
    const response = await api.get('/auth/session-status');
    return response.data;
  },
};

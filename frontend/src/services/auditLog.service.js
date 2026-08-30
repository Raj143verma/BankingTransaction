import api from './api';

export const auditLogService = {
  /**
   * Fetch paginated and filtered audit trail records (System User only)
   * GET /api/audit-logs
   * @param {Object} params - { page, limit, action, resourceType, actor, search, fromDate, toDate }
   */
  async getAuditLogs(params = {}) {
    const response = await api.get('/audit-logs', { params });
    return response.data;
  },

  /**
   * Fetch detailed audit record by ID (System User only)
   * GET /api/audit-logs/:id
   * @param {string} id - Audit Log ObjectId
   */
  async getAuditLogById(id) {
    const response = await api.get(`/audit-logs/${id}`);
    return response.data;
  },
};

export default auditLogService;

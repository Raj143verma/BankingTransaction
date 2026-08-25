import api from './api';

export const accountApplicationService = {
  /**
   * Submit a new customer account opening application
   * POST /api/account-applications
   */
  async submitApplication(applicationData) {
    const response = await api.post('/account-applications', applicationData);
    return response.data;
  },

  /**
   * Fetch all applications submitted by the authenticated customer
   * GET /api/account-applications/my
   */
  async getMyApplications() {
    const response = await api.get('/account-applications/my');
    return response.data;
  },

  /**
   * Fetch a specific application by ID
   * GET /api/account-applications/:id
   */
  async getApplicationById(id) {
    const response = await api.get(`/account-applications/${id}`);
    return response.data;
  },

  /**
   * Fetch all customer applications for system user review
   * GET /api/account-applications/system?status=...
   */
  async getSystemApplications(status) {
    const params = {};
    if (status && status !== 'ALL') {
      params.status = status;
    }
    const response = await api.get('/account-applications/system', { params });
    return response.data;
  },

  /**
   * Fetch complete application details for system review
   * GET /api/account-applications/system/:id
   */
  async getSystemApplicationById(id) {
    const response = await api.get(`/account-applications/system/${id}`);
    return response.data;
  },

  /**
   * Approve a customer application and create an active deposit account
   * POST /api/account-applications/system/:id/approve
   */
  async approveApplication(id) {
    const response = await api.post(`/account-applications/system/${id}/approve`);
    return response.data;
  },

  /**
   * Reject a customer application with a required reason
   * POST /api/account-applications/system/:id/reject
   */
  async rejectApplication(id, rejectionReason) {
    const response = await api.post(`/account-applications/system/${id}/reject`, {
      rejectionReason,
    });
    return response.data;
  },
};

export default accountApplicationService;

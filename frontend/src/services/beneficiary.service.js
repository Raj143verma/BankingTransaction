import api from './api';

export const beneficiaryService = {
  /**
   * List all beneficiaries for authenticated user
   * GET /api/beneficiaries
   */
  async getBeneficiaries() {
    const response = await api.get('/beneficiaries');
    return response.data;
  },

  /**
   * Get single beneficiary by ID
   * GET /api/beneficiaries/:id
   */
  async getBeneficiaryById(id) {
    const response = await api.get(`/beneficiaries/${id}`);
    return response.data;
  },

  /**
   * Create new beneficiary
   * POST /api/beneficiaries
   */
  async createBeneficiary(beneficiaryData) {
    const response = await api.post('/beneficiaries', beneficiaryData);
    return response.data;
  },

  /**
   * Update beneficiary (nickname, maxTransferLimit)
   * PATCH /api/beneficiaries/:id
   */
  async updateBeneficiary(id, updateData) {
    const response = await api.patch(`/beneficiaries/${id}`, updateData);
    return response.data;
  },

  /**
   * Activate beneficiary
   * PATCH /api/beneficiaries/:id/activate
   */
  async activateBeneficiary(id) {
    const response = await api.patch(`/beneficiaries/${id}/activate`);
    return response.data;
  },

  /**
   * Deactivate beneficiary
   * PATCH /api/beneficiaries/:id/deactivate
   */
  async deactivateBeneficiary(id) {
    const response = await api.patch(`/beneficiaries/${id}/deactivate`);
    return response.data;
  },

  /**
   * Remove (soft-delete) beneficiary
   * DELETE /api/beneficiaries/:id
   */
  async removeBeneficiary(id) {
    const response = await api.delete(`/beneficiaries/${id}`);
    return response.data;
  },

  /**
   * Get customer-safe transfer limits and usage
   * GET /api/transfer-limits
   */
  async getTransferLimits(accountId = null) {
    const params = accountId ? { accountId } : {};
    const response = await api.get('/transfer-limits', { params });
    return response.data;
  },

  /**
   * Get system transfer limit configuration (System User only)
   * GET /api/system/transfer-limits
   */
  async getSystemTransferLimits() {
    const response = await api.get('/system/transfer-limits');
    return response.data;
  },

  /**
   * Update system transfer limit configuration (System User only)
   * PATCH /api/system/transfer-limits
   */
  async updateSystemTransferLimits(configData) {
    const response = await api.patch('/system/transfer-limits', configData);
    return response.data;
  },
};

export default beneficiaryService;

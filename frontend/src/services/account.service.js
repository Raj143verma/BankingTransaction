import api from './api';

export const accountService = {
  /**
   * Fetch all accounts for currently authenticated user
   * GET /api/accounts
   */
  async getAccounts() {
    const response = await api.get('/accounts');
    return response.data;
  },

  /**
   * Fetch all customer deposit accounts (System User only)
   * GET /api/accounts/customer-accounts?status=...
   */
  async getCustomerAccounts(status) {
    const params = {};
    if (status && status !== 'ALL') {
      params.status = status;
    }
    const response = await api.get('/accounts/customer-accounts', { params });
    return response.data;
  },

  /**
   * Fetch derived ledger balance for a specific account
   * GET /api/accounts/balance/:accountId
   */
  async getAccountBalance(accountId) {
    const response = await api.get(`/accounts/balance/${accountId}`);
    return response.data;
  },

  /**
   * Update customer account lifecycle status (System User only)
   * PATCH /api/accounts/:id/status
   */
  async updateAccountStatus(id, status, reason) {
    const response = await api.patch(`/accounts/${id}/status`, { status, reason });
    return response.data;
  },

  /**
   * Create a new banking account for authenticated user
   * POST /api/accounts
   */
  async createAccount(accountData = {}) {
    const response = await api.post('/accounts', accountData);
    return response.data;
  },

  /**
   * Fetch account statement
   * GET /api/accounts/:id/statement
   */
  async getAccountStatement(id, params = {}) {
    const response = await api.get(`/accounts/${id}/statement`, { params });
    return response.data;
  },
};

export default accountService;

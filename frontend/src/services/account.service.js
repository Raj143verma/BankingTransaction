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
   * GET /api/accounts/customer-accounts
   */
  async getCustomerAccounts() {
    const response = await api.get('/accounts/customer-accounts');
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
   * Create a new banking account for authenticated user
   * POST /api/accounts
   */
  async createAccount(accountData = {}) {
    const response = await api.post('/accounts', accountData);
    return response.data;
  },
};

export default accountService;

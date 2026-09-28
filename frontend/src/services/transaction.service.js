import api from './api';

export const transactionService = {
  /**
   * Get paginated and filtered transactions relevant to the authenticated user
   * GET /api/transactions
   * @param {Object} params - { page, limit, search, fromDate, toDate, type, status }
   */
  async getTransactions(params = {}) {
    const response = await api.get('/transactions', { params });
    return response.data;
  },

  /**
   * Get aggregate transaction summary (totalCredits, totalDebits, netMovement)
   * GET /api/transactions/summary
   */
  async getTransactionSummary() {
    const response = await api.get('/transactions/summary');
    return response.data;
  },

  /**
   * Create and execute a new double-entry funds transfer
   * POST /api/transactions
   */
  async createTransaction(transferData) {
    const response = await api.post('/transactions', transferData);
    return response.data;
  },

  /**
   * Administratively reverse an eligible completed transaction (System User only)
   * POST /api/transactions/:id/reverse
   */
  async reverseTransaction(id, reason) {
    const response = await api.post(`/transactions/${id}/reverse`, { reason });
    return response.data;
  },

  /**
   * Deposit cash directly into customer account
   * POST /api/transactions/deposit
   */
  async depositCash(depositData) {
    const response = await api.post('/transactions/deposit', depositData);
    return response.data;
  },

  /**
   * Withdraw cash directly from customer account
   * POST /api/transactions/withdraw
   */
  async withdrawCash(withdrawData) {
    const response = await api.post('/transactions/withdraw', withdrawData);
    return response.data;
  },

  /**
   * Get all transactions across the bank with filters and pagination (System User only)
   * GET /api/transactions/system/all
   */
  async getSystemTransactions(params = {}) {
    const response = await api.get('/transactions/system/all', { params });
    return response.data;
  },
};

export default transactionService;

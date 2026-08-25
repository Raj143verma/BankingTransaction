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
};

export default transactionService;

import api from './api';

export const systemFundService = {
  /**
   * Initialize funds into a customer account (System User only)
   * POST /api/transactions/system/initialize-funds
   *
   * @param {Object} fundData - { toAccount: string, amount: number, idempotencyKey: string }
   */
  async initializeFunds(fundData) {
    const response = await api.post('/transactions/system/initialize-funds', fundData);
    return response.data;
  },
};

export default systemFundService;

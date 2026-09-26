import api from './api';

export const statementService = {
  /**
   * Fetch account statement data in JSON format
   * GET /api/accounts/:accountId/statement
   */
  async getStatement(accountId, params = {}) {
    const response = await api.get(`/accounts/${accountId}/statement`, {
      params,
    });
    return response.data;
  },

  /**
   * Download account statement in PDF format
   * GET /api/accounts/:accountId/statement?format=pdf
   */
  async downloadPdf(accountId, params = {}) {
    const queryParams = { ...params, format: 'pdf' };
    const response = await api.get(`/accounts/${accountId}/statement`, {
      params: queryParams,
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `statement_${accountId}_${params.startDate || 'start'}_${
        params.endDate || 'end'
      }.pdf`
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  /**
   * Download account statement in CSV format
   * GET /api/accounts/:accountId/statement?format=csv
   */
  async downloadCsv(accountId, params = {}) {
    const queryParams = { ...params, format: 'csv' };
    const response = await api.get(`/accounts/${accountId}/statement`, {
      params: queryParams,
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `statement_${accountId}_${params.startDate || 'start'}_${
        params.endDate || 'end'
      }.csv`
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

export default statementService;

import api from './api';

export const reconciliationService = {
  /**
   * Trigger a new financial reconciliation run
   * POST /api/reconciliation/run
   */
  async runReconciliation() {
    const response = await api.post('/reconciliation/run');
    return response.data;
  },

  /**
   * Fetch historical reconciliation runs
   * GET /api/reconciliation/runs
   */
  async getRuns(params = {}) {
    const response = await api.get('/reconciliation/runs', { params });
    return response.data;
  },

  /**
   * Fetch a specific reconciliation run by ID
   * GET /api/reconciliation/runs/:id
   */
  async getRunById(id) {
    const response = await api.get(`/reconciliation/runs/${id}`);
    return response.data;
  },

  /**
   * Fetch anomalies across runs
   * GET /api/reconciliation/anomalies
   */
  async getAnomalies(params = {}) {
    const response = await api.get('/reconciliation/anomalies', { params });
    return response.data;
  },

  /**
   * Download reconciliation report as CSV
   * GET /api/reconciliation/runs/:id/export/csv
   */
  async downloadCsv(runId) {
    const response = await api.get(`/reconciliation/runs/${runId}/export/csv`, {
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `financial-reconciliation-${runId}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  /**
   * Download reconciliation report as PDF
   * GET /api/reconciliation/runs/:id/export/pdf
   */
  async downloadPdf(runId) {
    const response = await api.get(`/reconciliation/runs/${runId}/export/pdf`, {
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `financial-reconciliation-${runId}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

export default reconciliationService;

const mongoose = require('mongoose');
const statementService = require('../services/statement.service');

/**
 * Controller to handle Account Statement queries, PDF generation, and CSV exports.
 */
async function getAccountStatementController(req, res, next) {
  try {
    const accountId = req.params.id || req.params.accountId;
    const { startDate, endDate, page, limit } = req.query || {};

    let targetFormat = 'json';

    if (
      req.path.endsWith('/export/csv') ||
      req.path.endsWith('/csv') ||
      (req.query && req.query.format === 'csv')
    ) {
      targetFormat = 'csv';
    } else if (
      req.path.endsWith('/export/pdf') ||
      req.path.endsWith('/pdf') ||
      (req.query && req.query.format === 'pdf')
    ) {
      targetFormat = 'pdf';
    } else if (req.query && req.query.format) {
      targetFormat = String(req.query.format).toLowerCase();
    }

    if (!accountId || !mongoose.Types.ObjectId.isValid(accountId)) {
      return res.status(400).json({
        message: 'Invalid account ID format',
      });
    }

    const user = req.user;
    const isSystemUser = user?.systemUser === true;

    // 1. Generate Statement using authoritative Ledger Service
    const statementData = await statementService.generateAccountStatement({
      accountId,
      user,
      isSystemUser,
      startDate,
      endDate,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 50,
    });

    const dateStr = new Date().toISOString().substring(0, 10);

    // 2. Format Handling: PDF Export
    if (targetFormat === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="account-statement-${accountId}-${dateStr}.pdf"`
      );

      statementService.streamStatementPdf(statementData, res);
      return;
    }

    // 3. Format Handling: CSV Export
    if (targetFormat === 'csv') {
      const csvContent = statementService.generateStatementCsv(statementData);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="account-statement-${accountId}-${dateStr}.csv"`
      );

      return res.status(200).send(csvContent);
    }

    // 4. Default JSON Response
    // Exclude internal full list from JSON payload to minimize payload size
    const { allPeriodTransactions, ...jsonPayload } = statementData;

    return res.status(200).json(jsonPayload);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        message: err.message,
      });
    }

    next(err);
  }
}

/**
 * Controller to explicitly export Account Statement as CSV.
 * GET /api/accounts/:id/statement/export/csv
 */
async function exportCsvStatementController(req, res, next) {
  req.query.format = 'csv';
  return getAccountStatementController(req, res, next);
}

/**
 * Controller to explicitly export Account Statement as PDF.
 * GET /api/accounts/:id/statement/export/pdf
 */
async function exportPdfStatementController(req, res, next) {
  req.query.format = 'pdf';
  return getAccountStatementController(req, res, next);
}

module.exports = {
  getAccountStatementController,
  exportCsvStatementController,
  exportPdfStatementController,
};

const mongoose = require('mongoose');
const reconciliationModel = require('../models/reconciliationRun.model');
const reconciliationService = require('../services/reconciliation.service');

/**
 * POST /api/reconciliation/run
 * Trigger an authoritative financial reconciliation run across all ledger records.
 * (System User only)
 */
async function runReconciliationController(req, res, next) {
  try {
    const { scope } = req.body || {};
    const runResult = await reconciliationService.executeReconciliationRun({
      user: req.user,
      scope,
      req,
    });

    return res.status(201).json({
      status: 'success',
      message: 'Financial reconciliation run executed successfully',
      data: runResult,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reconciliation/runs
 * Retrieve paginated historical reconciliation runs.
 * (System User only)
 */
async function getReconciliationRunsController(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const rawStatus = req.query.status ? String(req.query.status).trim().toUpperCase() : 'ALL';

    const filter = {};
    if (rawStatus !== 'ALL' && ['BALANCED', 'MISMATCH_DETECTED', 'FAILED'].includes(rawStatus)) {
      filter.status = rawStatus;
    }

    const totalCount = await reconciliationModel.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const skip = (page - 1) * limit;

    const runs = await reconciliationModel
      .find(filter)
      .populate('initiatedBy', 'name email')
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .select('-anomalies -accountSummaries') // Exclude heavy sub-documents from list view
      .lean();

    return res.status(200).json({
      runs,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      filters: {
        status: rawStatus,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reconciliation/runs/:id
 * Retrieve full details of a specific reconciliation run.
 * (System User only)
 */
async function getReconciliationRunByIdController(req, res, next) {
  try {
    const { id } = req.params;

    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { runId: id }] } : { runId: id };

    const runDoc = await reconciliationModel
      .findOne(query)
      .populate('initiatedBy', 'name email')
      .lean();

    if (!runDoc) {
      return res.status(404).json({
        status: 'error',
        message: 'Reconciliation run not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: runDoc,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reconciliation/anomalies
 * Query anomalies across latest or specific reconciliation runs.
 * (System User only)
 */
async function getReconciliationAnomaliesController(req, res, next) {
  try {
    const { runId, severity, anomalyType, resourceType } = req.query || {};

    let targetRun;
    if (runId) {
      const isObjectId = mongoose.Types.ObjectId.isValid(runId);
      const query = isObjectId ? { $or: [{ _id: runId }, { runId }] } : { runId };
      targetRun = await reconciliationModel.findOne(query).lean();
    } else {
      targetRun = await reconciliationModel.findOne().sort({ createdAt: -1 }).lean();
    }

    if (!targetRun) {
      return res.status(200).json({
        runId: null,
        anomalies: [],
        totalCount: 0,
      });
    }

    let filtered = targetRun.anomalies || [];

    if (severity && severity !== 'ALL') {
      filtered = filtered.filter(
        (a) => a.severity?.toUpperCase() === String(severity).toUpperCase()
      );
    }

    if (anomalyType && anomalyType !== 'ALL') {
      filtered = filtered.filter(
        (a) => a.anomalyType?.toUpperCase() === String(anomalyType).toUpperCase()
      );
    }

    if (resourceType && resourceType !== 'ALL') {
      filtered = filtered.filter(
        (a) => a.resourceType?.toUpperCase() === String(resourceType).toUpperCase()
      );
    }

    return res.status(200).json({
      runId: targetRun.runId,
      status: targetRun.status,
      completedAt: targetRun.completedAt,
      anomalies: filtered,
      totalCount: filtered.length,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reconciliation/runs/:id/export/csv
 * Export reconciliation run report as CSV.
 * (System User only)
 */
async function exportReconciliationCsvController(req, res, next) {
  try {
    const { id } = req.params;
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { runId: id }] } : { runId: id };

    const runDoc = await reconciliationModel.findOne(query).lean();
    if (!runDoc) {
      return res.status(404).json({
        status: 'error',
        message: 'Reconciliation run not found',
      });
    }

    const csvContent = reconciliationService.generateReconciliationCsv(runDoc);
    const dateStr = new Date().toISOString().substring(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="financial-reconciliation-${runDoc.runId}-${dateStr}.csv"`
    );
    return res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reconciliation/runs/:id/export/pdf
 * Export reconciliation run report as PDF.
 * (System User only)
 */
async function exportReconciliationPdfController(req, res, next) {
  try {
    const { id } = req.params;
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { runId: id }] } : { runId: id };

    const runDoc = await reconciliationModel.findOne(query).lean();
    if (!runDoc) {
      return res.status(404).json({
        status: 'error',
        message: 'Reconciliation run not found',
      });
    }

    const dateStr = new Date().toISOString().substring(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="financial-reconciliation-${runDoc.runId}-${dateStr}.pdf"`
    );

    reconciliationService.streamReconciliationPdf(runDoc, res);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  runReconciliationController,
  getReconciliationRunsController,
  getReconciliationRunByIdController,
  getReconciliationAnomaliesController,
  exportReconciliationCsvController,
  exportReconciliationPdfController,
};

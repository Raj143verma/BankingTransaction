const mongoose = require('mongoose');
const auditLogModel = require('../models/auditLog.model');
const userModel = require('../models/user.model');

/**
 * GET /api/audit-logs
 * Retrieve paginated, filtered audit trail logs (System User only).
 */
async function getAuditLogsController(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const rawAction = typeof req.query.action === 'string' ? req.query.action.trim().toUpperCase() : 'ALL';
    const rawResourceType = typeof req.query.resourceType === 'string' ? req.query.resourceType.trim().toUpperCase() : 'ALL';
    const rawActor = typeof req.query.actor === 'string' ? req.query.actor.trim() : '';
    const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const rawFromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : '';
    const rawToDate = typeof req.query.toDate === 'string' ? req.query.toDate.trim() : '';

    const queryConditions = [];

    // 1. Action Filter
    const VALID_ACTIONS = [
      'SYSTEM_LOGIN',
      'SYSTEM_LOGOUT',
      'APPLICATION_APPROVED',
      'APPLICATION_REJECTED',
      'ACCOUNT_SUSPENDED',
      'ACCOUNT_REACTIVATED',
      'ACCOUNT_DEACTIVATED',
      'TRANSACTION_REVERSED',
      'SYSTEM_FUNDS_INITIALIZED',
    ];
    if (rawAction !== 'ALL' && VALID_ACTIONS.includes(rawAction)) {
      queryConditions.push({ action: rawAction });
    }

    // 2. Resource Type Filter
    const VALID_RESOURCE_TYPES = ['ACCOUNT', 'ACCOUNT_APPLICATION', 'TRANSACTION', 'USER', 'SYSTEM'];
    if (rawResourceType !== 'ALL' && VALID_RESOURCE_TYPES.includes(rawResourceType)) {
      queryConditions.push({ resourceType: rawResourceType });
    }

    // 3. Actor Filter
    if (rawActor) {
      if (mongoose.Types.ObjectId.isValid(rawActor)) {
        queryConditions.push({ actor: new mongoose.Types.ObjectId(rawActor) });
      }
    }

    // 4. Date Range Filter
    if (rawFromDate || rawToDate) {
      const dateQuery = {};
      if (rawFromDate) {
        const startDate = new Date(rawFromDate);
        if (!isNaN(startDate.getTime())) {
          startDate.setHours(0, 0, 0, 0);
          dateQuery.$gte = startDate;
        }
      }
      if (rawToDate) {
        const endDate = new Date(rawToDate);
        if (!isNaN(endDate.getTime())) {
          endDate.setHours(23, 59, 59, 999);
          dateQuery.$lte = endDate;
        }
      }
      if (Object.keys(dateQuery).length > 0) {
        queryConditions.push({ createdAt: dateQuery });
      }
    }

    // 5. Search Filter
    if (rawSearch) {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(rawSearch);
      if (isObjectId) {
        const searchObjId = new mongoose.Types.ObjectId(rawSearch);
        queryConditions.push({
          $or: [
            { _id: searchObjId },
            { resourceId: searchObjId },
            { actor: searchObjId },
          ],
        });
      } else {
        const escaped = rawSearch.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const searchRegex = new RegExp(escaped, 'i');

        // Check if search matches user name or email
        const matchingUsers = await userModel.find({
          $or: [{ name: searchRegex }, { email: searchRegex }],
        }).select('_id').lean();

        const matchingUserIds = matchingUsers.map((u) => u._id);

        const searchOrClauses = [
          { reason: searchRegex },
          { action: searchRegex },
          { resourceType: searchRegex },
        ];

        if (matchingUserIds.length > 0) {
          searchOrClauses.push({ actor: { $in: matchingUserIds } });
        }

        queryConditions.push({ $or: searchOrClauses });
      }
    }

    const finalQuery =
      queryConditions.length === 0
        ? {}
        : queryConditions.length === 1
        ? queryConditions[0]
        : { $and: queryConditions };

    const totalCount = await auditLogModel.countDocuments(finalQuery);
    const totalPages = Math.ceil(totalCount / limit) || 0;
    const skip = (page - 1) * limit;

    const auditLogs = await auditLogModel
      .find(finalQuery)
      .populate('actor', 'name email systemUser')
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).json({
      status: 'success',
      auditLogs,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      filters: {
        action: rawAction,
        resourceType: rawResourceType,
        actor: rawActor || null,
        search: rawSearch || null,
        fromDate: rawFromDate || null,
        toDate: rawToDate || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/audit-logs/:id
 * Retrieve single audit trail log details (System User only).
 */
async function getAuditLogByIdController(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid audit log ID',
      });
    }

    const auditLog = await auditLogModel
      .findById(id)
      .populate('actor', 'name email systemUser')
      .lean();

    if (!auditLog) {
      return res.status(404).json({
        status: 'error',
        message: 'Audit log not found',
      });
    }

    return res.status(200).json({
      status: 'success',
      auditLog,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAuditLogsController,
  getAuditLogByIdController,
};

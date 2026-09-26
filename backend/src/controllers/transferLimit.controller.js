const transferLimitService = require('../services/transferLimit.service');

/**
 * GET /api/transfer-limits
 * Retrieve customer-safe transfer limit information and remaining daily allowances
 */
async function getCustomerTransferLimits(req, res, next) {
  try {
    const { accountId } = req.query || {};
    const limitSummary = await transferLimitService.getCustomerLimitSummary(
      accountId,
      req.user._id
    );

    return res.status(200).json({
      limits: limitSummary,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    next(err);
  }
}

/**
 * GET /api/system/transfer-limits
 * Retrieve complete administrative transfer limit configuration (System User only)
 */
async function getSystemTransferLimits(req, res, next) {
  try {
    const config = await transferLimitService.getTransferLimitConfig();
    return res.status(200).json({
      config,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    next(err);
  }
}

/**
 * PATCH /api/system/transfer-limits
 * Update administrative transfer limit configuration (System User only)
 */
async function updateSystemTransferLimits(req, res, next) {
  try {
    const updatedConfig = await transferLimitService.updateTransferLimitConfig(
      req.body || {},
      req.user,
      req
    );

    return res.status(200).json({
      message: 'Transfer limit configuration updated successfully',
      config: updatedConfig,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    next(err);
  }
}

module.exports = {
  getCustomerTransferLimits,
  getSystemTransferLimits,
  updateSystemTransferLimits,
};

const beneficiaryService = require('../services/beneficiary.service');

/**
 * POST /api/beneficiaries
 * Add a new beneficiary for authenticated customer
 */
async function createBeneficiary(req, res, next) {
  try {
    const { sourceAccount, toAccount, account, nickname, maxTransferLimit } = req.body || {};
    const targetAccountId = account || toAccount;

    const beneficiary = await beneficiaryService.createBeneficiary({
      user: req.user,
      sourceAccountId: sourceAccount,
      targetAccountId,
      nickname,
      maxTransferLimit,
      req,
    });

    return res.status(201).json({
      message: 'Beneficiary created successfully',
      beneficiary,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    next(err);
  }
}

/**
 * GET /api/beneficiaries
 * List all non-deleted beneficiaries for authenticated customer
 */
async function getBeneficiaries(req, res, next) {
  try {
    const beneficiaries = await beneficiaryService.getBeneficiaries(req.user._id, req.query);
    return res.status(200).json({
      beneficiaries,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    next(err);
  }
}

/**
 * GET /api/beneficiaries/:id
 * Retrieve one owned beneficiary by ID
 */
async function getBeneficiaryById(req, res, next) {
  try {
    const beneficiary = await beneficiaryService.getBeneficiaryById(req.user._id, req.params.id);
    return res.status(200).json({
      beneficiary,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    next(err);
  }
}

/**
 * PATCH /api/beneficiaries/:id
 * Update permitted fields on a beneficiary (nickname, maxTransferLimit)
 */
async function updateBeneficiary(req, res, next) {
  try {
    const updatedBeneficiary = await beneficiaryService.updateBeneficiary(
      req.user._id,
      req.params.id,
      req.body || {},
      req
    );
    return res.status(200).json({
      message: 'Beneficiary updated successfully',
      beneficiary: updatedBeneficiary,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    next(err);
  }
}

/**
 * PATCH /api/beneficiaries/:id/activate
 * Explicitly activate an eligible beneficiary
 */
async function activateBeneficiary(req, res, next) {
  try {
    const activatedBeneficiary = await beneficiaryService.activateBeneficiary(
      req.user._id,
      req.params.id,
      req
    );
    return res.status(200).json({
      message: 'Beneficiary activated successfully',
      beneficiary: activatedBeneficiary,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    next(err);
  }
}

/**
 * PATCH /api/beneficiaries/:id/deactivate
 * Deactivate an active beneficiary
 */
async function deactivateBeneficiary(req, res, next) {
  try {
    const deactivatedBeneficiary = await beneficiaryService.deactivateBeneficiary(
      req.user._id,
      req.params.id,
      req
    );
    return res.status(200).json({
      message: 'Beneficiary deactivated successfully',
      beneficiary: deactivatedBeneficiary,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    next(err);
  }
}

/**
 * DELETE /api/beneficiaries/:id
 * Remove a beneficiary
 */
async function removeBeneficiary(req, res, next) {
  try {
    const result = await beneficiaryService.removeBeneficiary(
      req.user._id,
      req.params.id,
      req
    );
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    next(err);
  }
}

module.exports = {
  createBeneficiary,
  getBeneficiaries,
  getBeneficiaryById,
  updateBeneficiary,
  activateBeneficiary,
  deactivateBeneficiary,
  removeBeneficiary,
};

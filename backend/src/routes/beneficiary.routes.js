const { Router } = require('express');
const { authMiddleware } = require('../middleware/auth.middleware');
const beneficiaryController = require('../controllers/beneficiary.controller');

const beneficiaryRouter = Router();

// Apply customer auth middleware to all beneficiary routes
beneficiaryRouter.use(authMiddleware);

/**
 * GET /api/beneficiaries
 * List authenticated customer's beneficiaries
 */
beneficiaryRouter.get('/', beneficiaryController.getBeneficiaries);

/**
 * POST /api/beneficiaries
 * Create a new beneficiary
 */
beneficiaryRouter.post('/', beneficiaryController.createBeneficiary);

/**
 * GET /api/beneficiaries/:id
 * Retrieve a specific owned beneficiary
 */
beneficiaryRouter.get('/:id', beneficiaryController.getBeneficiaryById);

/**
 * PATCH /api/beneficiaries/:id
 * Update permitted beneficiary fields (nickname, maxTransferLimit)
 */
beneficiaryRouter.patch('/:id', beneficiaryController.updateBeneficiary);

/**
 * PATCH /api/beneficiaries/:id/activate
 * Explicitly activate an eligible beneficiary
 */
beneficiaryRouter.patch('/:id/activate', beneficiaryController.activateBeneficiary);

/**
 * PATCH /api/beneficiaries/:id/deactivate
 * Deactivate an active beneficiary
 */
beneficiaryRouter.patch('/:id/deactivate', beneficiaryController.deactivateBeneficiary);

/**
 * DELETE /api/beneficiaries/:id
 * Remove (soft-delete) a beneficiary
 */
beneficiaryRouter.delete('/:id', beneficiaryController.removeBeneficiary);

module.exports = beneficiaryRouter;

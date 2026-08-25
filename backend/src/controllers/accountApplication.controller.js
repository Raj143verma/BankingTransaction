const mongoose = require('mongoose');
const accountApplicationModel = require('../models/accountApplication.model');
const accountModel = require('../models/account.model');
const transactionModel = require('../models/transaction.model');
const ladgerModel = require('../models/ladger.model');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_REGEX = /^[6-9]\d{9}$/;
const PIN_REGEX = /^\d{6}$/;
const VALID_GENDERS = ['MALE', 'FEMALE', 'OTHER'];
const VALID_ID_TYPES = ['AADHAAR', 'PAN', 'PASSPORT', 'VOTER_ID'];
const VALID_ACCOUNT_TYPES = ['SAVINGS', 'CURRENT'];

/**
 * POST /api/account-applications
 * Submit a new customer account opening application
 */
async function createAccountApplicationController(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized access, user not authenticated',
      });
    }

    // System users should not submit customer applications
    if (user.systemUser) {
      return res.status(403).json({
        status: 'error',
        message: 'System users cannot submit customer account opening applications',
      });
    }

    const {
      fullName,
      dateOfBirth,
      gender,
      mobileNumber,
      email,
      address,
      city,
      state,
      pinCode,
      idType,
      idNumber,
      accountType = 'SAVINGS',
      currency = 'INR',
      initialDeposit,
      confirmAccuracy,
      agreeTerms,
    } = req.body || {};

    // 1. Validate required fields presence
    if (
      !fullName ||
      !dateOfBirth ||
      !gender ||
      !mobileNumber ||
      !email ||
      !address ||
      !city ||
      !state ||
      !pinCode ||
      !idType ||
      !idNumber ||
      initialDeposit === undefined ||
      initialDeposit === null
    ) {
      return res.status(400).json({
        status: 'error',
        message: 'All application fields are required',
      });
    }

    // 2. Validate Personal Info
    const trimmedFullName = String(fullName).trim();
    if (trimmedFullName.length < 2 || trimmedFullName.length > 100) {
      return res.status(400).json({
        status: 'error',
        message: 'Full Name must be between 2 and 100 characters',
      });
    }

    const parsedDob = new Date(dateOfBirth);
    if (isNaN(parsedDob.getTime())) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a valid date of birth',
      });
    }

    const today = new Date();
    if (parsedDob >= today) {
      return res.status(400).json({
        status: 'error',
        message: 'Date of birth must be in the past',
      });
    }

    // Minimum age validation (18 years)
    const minAgeDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
    if (parsedDob > minAgeDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Applicant must be at least 18 years old to open an account',
      });
    }

    const normalizedGender = String(gender).trim().toUpperCase();
    if (!VALID_GENDERS.includes(normalizedGender)) {
      return res.status(400).json({
        status: 'error',
        message: 'Gender must be MALE, FEMALE, or OTHER',
      });
    }

    // 3. Validate Contact & Address
    const trimmedMobile = String(mobileNumber).trim();
    if (!MOBILE_REGEX.test(trimmedMobile) && !/^\d{10}$/.test(trimmedMobile)) {
      return res.status(400).json({
        status: 'error',
        message: 'Please enter a valid 10-digit mobile number',
      });
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmedEmail) || trimmedEmail.length > 150) {
      return res.status(400).json({
        status: 'error',
        message: 'Please enter a valid email address (maximum 150 characters)',
      });
    }

    const trimmedAddress = String(address).trim();
    const trimmedCity = String(city).trim();
    const trimmedState = String(state).trim();
    const trimmedPinCode = String(pinCode).trim();

    if (!trimmedAddress || !trimmedCity || !trimmedState) {
      return res.status(400).json({
        status: 'error',
        message: 'Address, City, and State are required',
      });
    }

    if (trimmedAddress.length > 250 || trimmedCity.length > 100 || trimmedState.length > 100) {
      return res.status(400).json({
        status: 'error',
        message: 'Address fields exceed allowed character limits',
      });
    }

    if (!PIN_REGEX.test(trimmedPinCode)) {
      return res.status(400).json({
        status: 'error',
        message: 'PIN Code must be a valid 6-digit number',
      });
    }

    // 4. Validate KYC / Identity
    const normalizedIdType = String(idType).trim().toUpperCase();
    if (!VALID_ID_TYPES.includes(normalizedIdType)) {
      return res.status(400).json({
        status: 'error',
        message: 'ID Type must be Aadhaar, PAN, Passport, or Voter ID',
      });
    }

    const trimmedIdNumber = String(idNumber).trim();
    if (trimmedIdNumber.length < 3 || trimmedIdNumber.length > 30) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a valid ID number (3 to 30 characters)',
      });
    }

    // 5. Validate Account Information
    const normalizedAccountType = String(accountType).trim().toUpperCase();
    if (!VALID_ACCOUNT_TYPES.includes(normalizedAccountType)) {
      return res.status(400).json({
        status: 'error',
        message: 'Account Type must be SAVINGS or CURRENT',
      });
    }

    const depositNum = Number(initialDeposit);
    if (!Number.isFinite(depositNum) || depositNum <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Initial deposit amount must be a finite number greater than zero',
      });
    }

    // 6. Validate Declarations
    if (confirmAccuracy !== true && confirmAccuracy !== 'true') {
      return res.status(400).json({
        status: 'error',
        message: 'You must confirm that the information provided is accurate',
      });
    }

    if (agreeTerms !== true && agreeTerms !== 'true') {
      return res.status(400).json({
        status: 'error',
        message: "You must agree to the bank's terms and conditions",
      });
    }

    // 7. Duplicate Pending Application Protection
    const existingPending = await accountApplicationModel.findOne({
      user: user._id,
      status: 'PENDING',
    });

    if (existingPending) {
      return res.status(400).json({
        status: 'error',
        message: 'You already have a pending account opening application.',
        existingApplicationId: existingPending._id,
      });
    }

    // 8. Create PENDING Application
    const application = await accountApplicationModel.create({
      user: user._id,
      fullName: trimmedFullName,
      dateOfBirth: parsedDob,
      gender: normalizedGender,
      mobileNumber: trimmedMobile,
      email: trimmedEmail,
      address: trimmedAddress,
      city: trimmedCity,
      state: trimmedState,
      pinCode: trimmedPinCode,
      idType: normalizedIdType,
      idNumber: trimmedIdNumber,
      accountType: normalizedAccountType,
      currency: currency === 'INR' ? 'INR' : 'INR',
      initialDeposit: depositNum,
      status: 'PENDING',
    });

    return res.status(201).json({
      message: 'Account opening application submitted successfully',
      application,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/account-applications/my
 * Fetch all applications submitted by the authenticated customer
 */
async function getMyAccountApplicationsController(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized access',
      });
    }

    const applications = await accountApplicationModel
      .find({ user: user._id })
      .populate('createdAccount', '_id accountType status currency createdAt')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      applications,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/account-applications/:id
 * Retrieve a specific account application by ID
 */
async function getAccountApplicationByIdController(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid application ID',
      });
    }

    const application = await accountApplicationModel
      .findById(id)
      .populate('createdAccount', '_id accountType status currency createdAt')
      .lean();

    if (!application) {
      return res.status(404).json({
        status: 'error',
        message: 'Account application not found',
      });
    }

    // Verify ownership: customer owns the application or is a system user
    if (
      application.user.toString() !== req.user._id.toString() &&
      !req.user.systemUser
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized: You do not have permission to view this application',
      });
    }

    return res.status(200).json({
      application,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/account-applications/system
 * Fetch customer account applications for system users with optional status filter
 */
async function getSystemAccountApplicationsController(req, res, next) {
  try {
    const { status } = req.query;

    const query = {};
    if (status && typeof status === 'string') {
      const upperStatus = status.trim().toUpperCase();
      if (['PENDING', 'APPROVED', 'REJECTED'].includes(upperStatus)) {
        query.status = upperStatus;
      }
    }

    const applications = await accountApplicationModel
      .find(query)
      .populate('user', '_id name email')
      .populate('createdAccount', '_id accountType status currency createdAt')
      .populate('reviewedBy', '_id name email')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      applications,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/account-applications/system/:id
 * Fetch complete details of one application for system review
 */
async function getSystemAccountApplicationByIdController(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid application ID',
      });
    }

    const application = await accountApplicationModel
      .findById(id)
      .populate('user', '_id name email')
      .populate('createdAccount', '_id accountType status currency createdAt')
      .populate('reviewedBy', '_id name email')
      .lean();

    if (!application) {
      return res.status(404).json({
        status: 'error',
        message: 'Account application not found',
      });
    }

    return res.status(200).json({
      application,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/account-applications/system/:id/approve
 * Atomically approve an application, create an ACTIVE deposit account,
 * and record initial deposit through the double-entry ledger architecture.
 */
async function approveAccountApplicationController(req, res, next) {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid application ID',
    });
  }

  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const application = await accountApplicationModel.findById(id).session(session);

    if (!application) {
      await session.abortTransaction();
      return res.status(404).json({
        status: 'error',
        message: 'Account application not found',
      });
    }

    if (application.status === 'APPROVED') {
      await session.abortTransaction();
      return res.status(400).json({
        status: 'error',
        message: 'Application has already been approved',
        createdAccountId: application.createdAccount,
      });
    }

    if (application.status === 'REJECTED') {
      await session.abortTransaction();
      return res.status(400).json({
        status: 'error',
        message: 'Cannot approve a rejected application',
      });
    }

    if (application.status !== 'PENDING') {
      await session.abortTransaction();
      return res.status(400).json({
        status: 'error',
        message: 'Only PENDING applications can be approved',
      });
    }

    // 1. Locate or initialize the reviewing system user's active account
    let systemAccount = await accountModel
      .findOne({ user: req.user._id, status: 'ACTIVE' })
      .session(session);

    if (!systemAccount) {
      const sysAccounts = await accountModel.create(
        [
          {
            user: req.user._id,
            accountHolderName: 'System Reserve',
            accountType: 'CURRENT',
            status: 'ACTIVE',
            currency: 'INR',
          },
        ],
        { session }
      );
      systemAccount = sysAccounts[0];
    }

    // 2. Create the customer's actual deposit Account with accountHolderName from application.fullName
    const createdAccounts = await accountModel.create(
      [
        {
          user: application.user,
          accountHolderName: application.fullName,
          accountType: application.accountType || 'SAVINGS',
          status: 'ACTIVE',
          currency: application.currency || 'INR',
        },
      ],
      { session }
    );

    const newAccount = createdAccounts[0];

    // 3. If initialDeposit > 0, record initial deposit using double-entry ledger
    if (application.initialDeposit && application.initialDeposit > 0) {
      const idempotencyKey = `INITIAL_DEPOSIT_${application._id}`;

      const initialDepositTx = (
        await transactionModel.create(
          [
            {
              fromAccount: systemAccount._id,
              toAccount: newAccount._id,
              amount: application.initialDeposit,
              idempotencyKey: idempotencyKey,
              status: 'COMPLETED',
            },
          ],
          { session }
        )
      )[0];

      await ladgerModel.create(
        [
          {
            account: systemAccount._id,
            amount: application.initialDeposit,
            transaction: initialDepositTx._id,
            type: 'DEBIT',
          },
        ],
        { session }
      );

      await ladgerModel.create(
        [
          {
            account: newAccount._id,
            amount: application.initialDeposit,
            transaction: initialDepositTx._id,
            type: 'CREDIT',
          },
        ],
        { session }
      );
    }

    // 4. Transition Application to APPROVED and link createdAccount
    application.status = 'APPROVED';
    application.createdAccount = newAccount._id;
    application.reviewedBy = req.user._id;
    application.reviewedAt = new Date();
    await application.save({ session });

    await session.commitTransaction();

    return res.status(200).json({
      message: 'Application approved successfully and deposit account created',
      application,
      account: newAccount,
    });
  } catch (err) {
    if (session && session.inTransaction && session.inTransaction()) {
      try {
        await session.abortTransaction();
      } catch (_) {}
    }
    next(err);
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch (_) {}
    }
  }
}

/**
 * POST /api/account-applications/system/:id/reject
 * Reject a customer account opening application with a mandatory rejection reason
 */
async function rejectAccountApplicationController(req, res, next) {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid application ID',
      });
    }

    if (!rejectionReason || typeof rejectionReason !== 'string' || !rejectionReason.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'A non-empty rejection reason is required',
      });
    }

    const trimmedReason = rejectionReason.trim();
    if (trimmedReason.length > 500) {
      return res.status(400).json({
        status: 'error',
        message: 'Rejection reason cannot exceed 500 characters',
      });
    }

    const application = await accountApplicationModel.findById(id);

    if (!application) {
      return res.status(404).json({
        status: 'error',
        message: 'Account application not found',
      });
    }

    if (application.status === 'APPROVED') {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot reject an already approved application',
      });
    }

    if (application.status === 'REJECTED') {
      return res.status(400).json({
        status: 'error',
        message: 'Application has already been rejected',
      });
    }

    if (application.status !== 'PENDING') {
      return res.status(400).json({
        status: 'error',
        message: 'Only PENDING applications can be rejected',
      });
    }

    application.status = 'REJECTED';
    application.rejectionReason = trimmedReason;
    application.reviewedBy = req.user._id;
    application.reviewedAt = new Date();
    await application.save();

    return res.status(200).json({
      message: 'Application rejected successfully',
      application,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createAccountApplicationController,
  getMyAccountApplicationsController,
  getAccountApplicationByIdController,
  getSystemAccountApplicationsController,
  getSystemAccountApplicationByIdController,
  approveAccountApplicationController,
  rejectAccountApplicationController,
};

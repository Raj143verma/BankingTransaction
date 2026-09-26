const mongoose = require("mongoose");
const accountModel = require("../models/account.model");
const userModel = require("../models/user.model");
const accountApplicationModel = require("../models/accountApplication.model");
const { logAuditEvent } = require("../services/auditLog.service");
const notificationService = require("../services/notification.service");

async function createAccountController(req, res, next) {
  try {
    const user = req.user;

    const account = await accountModel.create({
      user: user._id,
      accountHolderName: req.body?.accountHolderName || user.name || "Account Holder",
      accountType: req.body?.accountType || "SAVINGS",
      currency: req.body?.currency || "INR",
    });

    return res.status(201).json({
      account,
    });
  } catch (err) {
    next(err);
  }
}

async function getUserAccountsController(req, res, next) {
  try {
    const accounts = await accountModel
      .find({ user: req.user._id })
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .lean();

    // Check linked applications for legacy accounts missing accountHolderName
    const accountIds = accounts.map((a) => a._id);
    const linkedApps = await accountApplicationModel
      .find({ createdAccount: { $in: accountIds } })
      .select("createdAccount fullName")
      .lean();

    const appNameMap = new Map();
    linkedApps.forEach((app) => {
      if (app.createdAccount && app.fullName) {
        appNameMap.set(app.createdAccount.toString(), app.fullName);
      }
    });

    const formattedAccounts = accounts.map((acc) => {
      const holderName =
        acc.accountHolderName ||
        appNameMap.get(acc._id.toString()) ||
        acc.user?.name ||
        req.user?.name ||
        "Account Holder";

      return {
        _id: acc._id,
        accountHolderName: holderName,
        accountType: acc.accountType || "SAVINGS",
        currency: acc.currency || "INR",
        status: acc.status || "ACTIVE",
        createdAt: acc.createdAt,
        user: acc.user
          ? {
              _id: acc.user._id,
              name: acc.user.name,
              email: acc.user.email,
            }
          : {
              _id: req.user._id,
              name: req.user.name,
              email: req.user.email,
            },
      };
    });

    return res.status(200).json({
      accounts: formattedAccounts,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/accounts/customer-accounts
 * Fetch all customer deposit accounts (System User only)
 */
async function getCustomerAccountsController(req, res, next) {
  try {
    // 1. Find all users that are normal customers (systemUser !== true)
    const customerUsers = await userModel
      .find({ systemUser: { $ne: true } })
      .select("_id name email");
    const customerUserIds = customerUsers.map((u) => u._id);

    if (customerUserIds.length === 0) {
      return res.status(200).json({
        accounts: [],
      });
    }

    const statusFilter = typeof req.query?.status === 'string' ? req.query.status.trim().toUpperCase() : 'ALL';
    const accountQuery = { user: { $in: customerUserIds } };
    if (['ACTIVE', 'SUSPENDED', 'INACTIVE'].includes(statusFilter)) {
      accountQuery.status = statusFilter;
    }

    // 2. Find customer deposit accounts matching query
    const accounts = await accountModel
      .find(accountQuery)
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .lean();

    const accountIds = accounts.map((a) => a._id);
    const linkedApps = await accountApplicationModel
      .find({ createdAccount: { $in: accountIds } })
      .select("createdAccount fullName")
      .lean();

    const appNameMap = new Map();
    linkedApps.forEach((app) => {
      if (app.createdAccount && app.fullName) {
        appNameMap.set(app.createdAccount.toString(), app.fullName);
      }
    });

    const formattedAccounts = accounts.map((acc) => {
      const holderName =
        acc.accountHolderName ||
        appNameMap.get(acc._id.toString()) ||
        acc.user?.name ||
        "Account Holder";

      return {
        _id: acc._id,
        accountHolderName: holderName,
        accountType: acc.accountType || "SAVINGS",
        currency: acc.currency || "INR",
        status: acc.status || "ACTIVE",
        createdAt: acc.createdAt,
        user: acc.user
          ? {
              _id: acc.user._id,
              name: acc.user.name,
              email: acc.user.email,
            }
          : null,
      };
    });

    return res.status(200).json({
      accounts: formattedAccounts,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/accounts/:id/status
 * Update customer account lifecycle status (System User only)
 */
async function updateAccountStatusController(req, res, next) {
  try {
    const { id } = req.params;
    const { status: requestedStatus, reason } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid account ID",
      });
    }

    if (!requestedStatus || typeof requestedStatus !== "string") {
      return res.status(400).json({
        status: "error",
        message: "Status must be ACTIVE, SUSPENDED, or INACTIVE",
      });
    }

    const normalizedStatus = requestedStatus.trim().toUpperCase();
    const VALID_STATUSES = ["ACTIVE", "SUSPENDED", "INACTIVE"];
    if (!VALID_STATUSES.includes(normalizedStatus)) {
      return res.status(400).json({
        status: "error",
        message: "Status must be ACTIVE, SUSPENDED, or INACTIVE",
      });
    }

    if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
      return res.status(400).json({
        status: "error",
        message: "A reason of at least 5 characters is required for changing account status",
      });
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length > 500) {
      return res.status(400).json({
        status: "error",
        message: "Reason cannot exceed 500 characters",
      });
    }

    // 1. Locate target account and populate owner
    const account = await accountModel.findById(id).populate("user", "name email systemUser");
    if (!account) {
      return res.status(404).json({
        status: "error",
        message: "Account not found",
      });
    }

    // 2. Guard institutional system reserve accounts
    if (
      account.user?.systemUser === true ||
      account.accountHolderName === "System Reserve" ||
      account.accountHolderName === "System Central Reserve"
    ) {
      return res.status(400).json({
        status: "error",
        message: "Institutional system accounts cannot have their status modified",
      });
    }

    // 3. Transition validation
    const currentStatus = account.status || "ACTIVE";
    if (currentStatus === normalizedStatus) {
      return res.status(400).json({
        status: "error",
        message: `Account is already in ${currentStatus} status`,
      });
    }

    if (currentStatus === "INACTIVE" && normalizedStatus === "SUSPENDED") {
      return res.status(400).json({
        status: "error",
        message: "Invalid status transition: Cannot transition account from INACTIVE to SUSPENDED",
      });
    }

    // 4. Atomic status update with optimistic version lock
    const updatedAccount = await accountModel
      .findOneAndUpdate(
        { _id: account._id, status: currentStatus },
        {
          $set: { status: normalizedStatus },
          $inc: { __v: 1 },
        },
        { returnDocument: "after", runValidators: true }
      )
      .populate("user", "name email");

    if (!updatedAccount) {
      return res.status(409).json({
        status: "error",
        message: "Account status was modified by another concurrent request. Please reload and try again.",
      });
    }

    // Resolve holder name
    let holderName = updatedAccount.accountHolderName;
    if (!holderName) {
      const linkedApp = await accountApplicationModel
        .findOne({ createdAccount: updatedAccount._id })
        .select("fullName")
        .lean();
      holderName = linkedApp?.fullName || updatedAccount.user?.name || "Account Holder";
    }

    let actionType = "ACCOUNT_SUSPENDED";
    if (normalizedStatus === "ACTIVE") actionType = "ACCOUNT_REACTIVATED";
    else if (normalizedStatus === "INACTIVE") actionType = "ACCOUNT_DEACTIVATED";

    await logAuditEvent({
      actor: req.user._id,
      action: actionType,
      resourceType: "ACCOUNT",
      resourceId: updatedAccount._id,
      previousState: { status: currentStatus },
      newState: { status: normalizedStatus },
      reason: trimmedReason,
      metadata: {
        accountHolderName: holderName,
        accountType: updatedAccount.accountType || "SAVINGS",
        currency: updatedAccount.currency || "INR",
      },
      req,
    });

    try {
      const targetUserId = updatedAccount.user?._id || updatedAccount.user;
      if (targetUserId) {
        let notifTitle = "Account Status Updated";
        let notifSeverity = "INFO";
        let notifMsg = `Your account (${holderName}) status has been changed to ${normalizedStatus}. Reason: ${trimmedReason}`;

        if (normalizedStatus === "SUSPENDED") {
          notifTitle = "Account Suspended";
          notifSeverity = "WARNING";
          notifMsg = `Your account (${holderName}) has been suspended. Reason: ${trimmedReason}`;
        } else if (normalizedStatus === "ACTIVE") {
          notifTitle = "Account Reactivated";
          notifSeverity = "SUCCESS";
          notifMsg = `Your account (${holderName}) has been reactivated and is now active. Reason: ${trimmedReason}`;
        } else if (normalizedStatus === "INACTIVE") {
          notifTitle = "Account Deactivated";
          notifSeverity = "ERROR";
          notifMsg = `Your account (${holderName}) has been deactivated. Reason: ${trimmedReason}`;
        }

        await notificationService.createNotification({
          recipient: targetUserId,
          type: actionType,
          title: notifTitle,
          message: notifMsg,
          severity: notifSeverity,
          relatedResourceType: "ACCOUNT",
          relatedResourceId: updatedAccount._id,
          metadata: {
            previousStatus: currentStatus,
            newStatus: normalizedStatus,
            reason: trimmedReason,
            accountId: updatedAccount._id,
          },
        });
      }
    } catch (notifErr) {
      console.error("Failed to emit account status notification:", notifErr.message);
    }

    return res.status(200).json({
      status: "success",
      message: `Account status updated successfully from ${currentStatus} to ${normalizedStatus}`,
      account: {
        _id: updatedAccount._id,
        accountHolderName: holderName,
        accountType: updatedAccount.accountType || "SAVINGS",
        status: updatedAccount.status,
        currency: updatedAccount.currency || "INR",
        createdAt: updatedAccount.createdAt,
        updatedAt: updatedAccount.updatedAt,
        user: updatedAccount.user
          ? {
              _id: updatedAccount.user._id,
              name: updatedAccount.user.name,
              email: updatedAccount.user.email,
            }
          : null,
      },
      audit: {
        accountId: updatedAccount._id,
        previousStatus: currentStatus,
        newStatus: normalizedStatus,
        reason: trimmedReason,
        updatedBy: {
          _id: req.user._id,
          name: req.user.name,
          email: req.user.email,
        },
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getAccountBalanceController(req, res, next) {
  try {
    const { accountId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid account ID",
      });
    }

    const query = { _id: accountId };
    if (!req.user.systemUser) {
      query.user = req.user._id;
    }

    const account = await accountModel.findOne(query);

    if (!account) {
      return res.status(404).json({
        status: "error",
        message: "Account not found",
      });
    }

    const balance = await account.getBalance();

    return res.status(200).json({
      accountId: account._id,
      balance: balance,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createAccountController,
  getUserAccountsController,
  getCustomerAccountsController,
  getAccountBalanceController,
  updateAccountStatusController,
};

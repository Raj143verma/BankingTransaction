const mongoose = require("mongoose");
const accountModel = require("../models/account.model");
const userModel = require("../models/user.model");
const accountApplicationModel = require("../models/accountApplication.model");

async function createAccountController(req, res) {
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
    return res.status(500).json({
      message: err.message || "Failed to create account",
    });
  }
}

async function getUserAccountsController(req, res) {
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
    return res.status(500).json({
      message: err.message || "Failed to fetch accounts",
    });
  }
}

/**
 * GET /api/accounts/customer-accounts
 * Fetch all customer deposit accounts (System User only)
 */
async function getCustomerAccountsController(req, res) {
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

    // 2. Find all active deposit accounts belonging to customer users
    const accounts = await accountModel
      .find({
        user: { $in: customerUserIds },
        status: "ACTIVE",
      })
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
        status: acc.status,
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
    return res.status(500).json({
      message: err.message || "Failed to fetch customer accounts",
    });
  }
}

async function getAccountBalanceController(req, res) {
  try {
    const { accountId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      return res.status(400).json({
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
        message: "Account not found",
      });
    }

    const balance = await account.getBalance();

    return res.status(200).json({
      accountId: account._id,
      balance: balance,
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Failed to fetch account balance",
    });
  }
}

module.exports = {
  createAccountController,
  getUserAccountsController,
  getCustomerAccountsController,
  getAccountBalanceController,
};
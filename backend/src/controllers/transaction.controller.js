const transactionModel = require("../models/transaction.model")
const ladgerModel = require("../models/ladger.model")
const accountModel = require("../models/account.model")
const accountApplicationModel = require("../models/accountApplication.model")
const userModel = require("../models/user.model")
const beneficiaryModel = require("../models/beneficiary.model")
const transferLimitConfigModel = require("../models/transferLimitConfig.model")
const mongoose = require("mongoose")
const emailService = require("../services/email.service")
const { logAuditEvent } = require("../services/auditLog.service")
const notificationService = require("../services/notification.service")



/**
 * -Create a new transaction schema
 * The 10 step transaction process is as follows:
 * 1. Validate the request
 * 2. Validate idempotency key
 * 3. check account status
 * 4.Drive sender balance from  ladger
 * 5. create a transaction with status pending
 * 6. Create a DEBIT ladger entry for sender
 * 7. Create a CREDIT ladger entry for receiver
 * 8.mark transaction as completed
 * 9. commit mongoose session
 * 10. send email notification to sender and receiver
 * */

async function createTransaction(req, res, next) {


    /**
     * Step 1: Validate the request
     */
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body;

    if(!fromAccount || !toAccount || amount === undefined || amount === null || !idempotencyKey) {
        return res.status(400).json({
            message: "FromAccount, ToAccount, Amount and IdempotencyKey are required to create a transaction",
        })
    }

    if(typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({
            message: "Transaction amount must be a finite number greater than zero"
        })
    }

    if(!mongoose.Types.ObjectId.isValid(fromAccount)) {
        return res.status(400).json({
            message: "Invalid fromAccount ID"
        })
    }

    if(!mongoose.Types.ObjectId.isValid(toAccount)) {
        return res.status(400).json({
            message: "Invalid toAccount ID"
        })
    }

    if(fromAccount.toString() === toAccount.toString()) {
        return res.status(400).json({
            message: "Source and destination accounts cannot be the same"
        })
    }

    const fromUserAccount = await accountModel.findOne({
        _id: fromAccount,
    })
    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    })
    if(!fromUserAccount || !toUserAccount) {
        return res.status(400).json({
            message: "FromAccount or ToAccount not found"
        })
    }

    if(fromUserAccount.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({
            message: "Unauthorized: You do not own the source account"
        })
    }

    /**
     * Step 2: Validate idempotency key
     */

    const isTransactionAlreadyExists = await transactionModel.findOne({
        idempotencyKey: idempotencyKey
    })
    if(isTransactionAlreadyExists) {
        if(isTransactionAlreadyExists.status === "COMPLETED") {
            return res.status(200).json({
                message: "Transaction with this idempotency key already exists and is completed",
                transaction: isTransactionAlreadyExists
            })
        }
        if(isTransactionAlreadyExists.status === "PENDING") {
            return res.status(200).json({
                message: "Transaction with this idempotency key already exists and is pending"
            })
        }
        if(isTransactionAlreadyExists.status === "FAILED") {
            return res.status(500).json({
                message: "Transaction with this idempotency key already exists and is failed"
            })
        }
        if(isTransactionAlreadyExists.status === "REVERSED") {
            return res.status(500).json({
                message: "Transaction with this idempotency key already exists and is reversed"
})
        }
    }

    /**
     * Step 3: Check account status
     */

    if(fromUserAccount.status !== "ACTIVE" || toUserAccount.status !== "ACTIVE") {
        return res.status(400).json({
            message: "FromAccount or ToAccount is not active"
        })
    }

    /**
     * Step 3b: Validate Beneficiary Relationship & Controls (if beneficiary exists)
     */
    const beneficiary = await beneficiaryModel.findOne({
        user: req.user._id,
        account: toAccount,
        isDeleted: false
    });

    if (beneficiary) {
        if (beneficiary.status === "COOLING_OFF") {
            if (beneficiary.coolingOffExpiresAt && new Date(beneficiary.coolingOffExpiresAt) > new Date()) {
                const remainingMs = new Date(beneficiary.coolingOffExpiresAt) - new Date();
                const remainingMins = Math.ceil(remainingMs / 60000);

                try {
                    await logAuditEvent({
                        actor: req.user._id,
                        action: "TRANSFER_BLOCKED",
                        resourceType: "BENEFICIARY",
                        resourceId: beneficiary._id,
                        reason: `Transfer blocked: Beneficiary is in cooling-off period (${remainingMins} min remaining)`,
                        metadata: { fromAccount, toAccount, amount, beneficiaryId: beneficiary._id },
                        req
                    });

                    await notificationService.createNotification({
                        recipient: req.user._id,
                        type: "TRANSFER_BLOCKED",
                        title: "Transfer Blocked",
                        message: `Transfer to '${beneficiary.nickname}' was blocked because the beneficiary is in a cooling-off period until ${new Date(beneficiary.coolingOffExpiresAt).toLocaleTimeString()}.`,
                        severity: "WARNING",
                        relatedResourceType: "BENEFICIARY",
                        relatedResourceId: beneficiary._id,
                        metadata: { fromAccount, toAccount, amount }
                    });
                } catch (e) {}

                return res.status(400).json({
                    message: `Transfer blocked: Beneficiary '${beneficiary.nickname}' is currently in a cooling-off period (${remainingMins} minute(s) remaining until ${new Date(beneficiary.coolingOffExpiresAt).toLocaleTimeString()}).`
                });
            } else {
                // Cooling period elapsed: auto-activate
                beneficiary.status = "ACTIVE";
                beneficiary.activatedAt = beneficiary.activatedAt || new Date();
                await beneficiary.save();
            }
        }

        if (beneficiary.status === "INACTIVE" || beneficiary.status === "BLOCKED") {
            try {
                await logAuditEvent({
                    actor: req.user._id,
                    action: "TRANSFER_BLOCKED",
                    resourceType: "BENEFICIARY",
                    resourceId: beneficiary._id,
                    reason: `Transfer blocked: Beneficiary status is ${beneficiary.status}`,
                    metadata: { fromAccount, toAccount, amount, beneficiaryId: beneficiary._id },
                    req
                });

                await notificationService.createNotification({
                    recipient: req.user._id,
                    type: "TRANSFER_BLOCKED",
                    title: "Transfer Blocked",
                    message: `Transfer to '${beneficiary.nickname}' was blocked because the beneficiary is ${beneficiary.status}.`,
                    severity: "WARNING",
                    relatedResourceType: "BENEFICIARY",
                    relatedResourceId: beneficiary._id,
                    metadata: { fromAccount, toAccount, amount }
                });
            } catch (e) {}

            return res.status(400).json({
                message: `Transfer blocked: Beneficiary '${beneficiary.nickname}' is ${beneficiary.status}`
            });
        }

        if (beneficiary.maxTransferLimit !== null && beneficiary.maxTransferLimit !== undefined && amount > beneficiary.maxTransferLimit) {
            try {
                await logAuditEvent({
                    actor: req.user._id,
                    action: "TRANSFER_LIMIT_EXCEEDED",
                    resourceType: "TRANSACTION",
                    reason: `Transfer amount ₹${amount} exceeds beneficiary-specific limit of ₹${beneficiary.maxTransferLimit}`,
                    metadata: { fromAccount, toAccount, amount, beneficiaryLimit: beneficiary.maxTransferLimit },
                    req
                });

                await notificationService.createNotification({
                    recipient: req.user._id,
                    type: "TRANSFER_LIMIT_EXCEEDED",
                    title: "Transfer Limit Exceeded",
                    message: `Transfer of ₹${amount} exceeds beneficiary '${beneficiary.nickname}' limit of ₹${beneficiary.maxTransferLimit}.`,
                    severity: "WARNING",
                    relatedResourceType: "TRANSACTION",
                    metadata: { fromAccount, toAccount, amount, beneficiaryLimit: beneficiary.maxTransferLimit }
                });
            } catch (e) {}

            return res.status(400).json({
                message: `Transaction amount ₹${amount} exceeds beneficiary transfer limit of ₹${beneficiary.maxTransferLimit}`
            });
        }
    }

    /**
     * Step 4: Execute transaction with serialization lock and bounded retry on transient write conflicts
     */
    const MAX_RETRIES = 3;
    let transaction;
    let transactionCommitted = false;

    for(let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        let session;
        try {
            session = await mongoose.startSession();
            session.startTransaction();

            // Step 4a: Check system-level transfer limits inside active session
            const limitConfig = await transferLimitConfigModel.getConfig(session);

            if (amount > limitConfig.perTransactionLimit) {
                await session.abortTransaction();

                try {
                    await logAuditEvent({
                        actor: req.user._id,
                        action: "TRANSFER_LIMIT_EXCEEDED",
                        resourceType: "TRANSACTION",
                        reason: `Transaction amount ₹${amount} exceeds per-transaction limit of ₹${limitConfig.perTransactionLimit}`,
                        metadata: { fromAccount, toAccount, amount, perTransactionLimit: limitConfig.perTransactionLimit },
                        req
                    });

                    await notificationService.createNotification({
                        recipient: req.user._id,
                        type: "TRANSFER_LIMIT_EXCEEDED",
                        title: "Transfer Limit Exceeded",
                        message: `Transfer amount ₹${amount} exceeds the maximum per-transaction limit of ₹${limitConfig.perTransactionLimit}.`,
                        severity: "WARNING",
                        relatedResourceType: "TRANSACTION",
                        metadata: { amount, perTransactionLimit: limitConfig.perTransactionLimit }
                    });
                } catch (e) {}

                return res.status(400).json({
                    message: `Transaction amount ₹${amount} exceeds the maximum per-transaction limit of ₹${limitConfig.perTransactionLimit}`
                });
            }

            // Calculate authoritative daily usage inside active session
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);

            const todayCompletedTxs = await transactionModel.find({
                fromAccount: fromAccount,
                status: "COMPLETED",
                createdAt: { $gte: startOfDay, $lte: endOfDay }
            }, 'amount', { session });

            const dailySpent = todayCompletedTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
            const dailyCount = todayCompletedTxs.length;

            if (dailySpent + amount > limitConfig.dailyAmountLimit) {
                await session.abortTransaction();

                try {
                    await logAuditEvent({
                        actor: req.user._id,
                        action: "TRANSFER_LIMIT_EXCEEDED",
                        resourceType: "TRANSACTION",
                        reason: `Daily transfer amount limit exceeded. Spent: ₹${dailySpent}, Requested: ₹${amount}, Limit: ₹${limitConfig.dailyAmountLimit}`,
                        metadata: { fromAccount, toAccount, amount, dailySpent, dailyAmountLimit: limitConfig.dailyAmountLimit },
                        req
                    });

                    await notificationService.createNotification({
                        recipient: req.user._id,
                        type: "TRANSFER_LIMIT_EXCEEDED",
                        title: "Daily Transfer Limit Exceeded",
                        message: `Daily transfer limit of ₹${limitConfig.dailyAmountLimit} exceeded. You have already spent ₹${dailySpent} today.`,
                        severity: "WARNING",
                        relatedResourceType: "TRANSACTION",
                        metadata: { dailySpent, requested: amount, limit: limitConfig.dailyAmountLimit }
                    });
                } catch (e) {}

                return res.status(400).json({
                    message: `Daily transfer limit exceeded. Current daily spent: ₹${dailySpent}, requested: ₹${amount}, daily limit: ₹${limitConfig.dailyAmountLimit}, remaining allowance: ₹${Math.max(0, limitConfig.dailyAmountLimit - dailySpent)}`
                });
            }

            if (dailyCount + 1 > limitConfig.dailyCountLimit) {
                await session.abortTransaction();

                try {
                    await logAuditEvent({
                        actor: req.user._id,
                        action: "TRANSFER_LIMIT_EXCEEDED",
                        resourceType: "TRANSACTION",
                        reason: `Daily transaction count limit of ${limitConfig.dailyCountLimit} exceeded. Completed today: ${dailyCount}`,
                        metadata: { fromAccount, toAccount, amount, dailyCount, dailyCountLimit: limitConfig.dailyCountLimit },
                        req
                    });

                    await notificationService.createNotification({
                        recipient: req.user._id,
                        type: "TRANSFER_LIMIT_EXCEEDED",
                        title: "Daily Transaction Count Limit Exceeded",
                        message: `Daily transaction count limit of ${limitConfig.dailyCountLimit} exceeded. You have initiated ${dailyCount} transactions today.`,
                        severity: "WARNING",
                        relatedResourceType: "TRANSACTION",
                        metadata: { dailyCount, limit: limitConfig.dailyCountLimit }
                    });
                } catch (e) {}

                return res.status(400).json({
                    message: `Daily transaction count limit exceeded. Maximum daily transactions allowed is ${limitConfig.dailyCountLimit}`
                });
            }

            // Step 4b: Atomic document write/touch on source account inside transaction to establish serialization lock
            const lockedFromAccount = await accountModel.findOneAndUpdate(
                { _id: fromAccount, status: "ACTIVE" },
                { $inc: { __v: 1 } },
                { session, returnDocument: 'after' }
            );

            if(!lockedFromAccount) {
                await session.abortTransaction();
                return res.status(400).json({
                    message: "FromAccount is not active or not found"
                });
            }

            // Step 4c: Derive sender balance from ledger within active session
            const balance = await lockedFromAccount.getBalance(session);
            if(balance < amount) {
                await session.abortTransaction();
                return res.status(400).json({
                    message: `Insufficient balance. Current balance is ${balance}.Requested amount is ${amount}`
                });
            }

            // Step 5: Create a transaction with status pending
            transaction = (await transactionModel.create([{
                fromAccount,
                toAccount,
                amount,
                idempotencyKey,
                status: "PENDING",
            }], { session }))[0];

            // Step 6: Create DEBIT ledger entry
            const debitLadgerEntry = await ladgerModel.create([{
                account: fromAccount,
                amount: amount,
                transaction: transaction._id,
                type: "DEBIT"
            }], { session });

            // Step 7: Create CREDIT ledger entry
            const creditLadgerEntry = await ladgerModel.create([{
                account: toAccount,
                amount: amount,
                transaction: transaction._id,
                type: "CREDIT"
            }], { session });

            // Step 8: Mark transaction as completed
            await transactionModel.findByIdAndUpdate(
                { _id: transaction._id },
                { status: "COMPLETED" },
                { session }
            );
            transaction.status = "COMPLETED";

            // Step 9: Commit transaction
            await session.commitTransaction();
            transactionCommitted = true;
            break;
        } catch(err) {
            if (session && session.inTransaction && session.inTransaction()) {
                try {
                    await session.abortTransaction();
                } catch (abortErr) {}
            }

            const isTransientError = (err.hasErrorLabel && err.hasErrorLabel("TransientTransactionError")) ||
                err.code === 112 ||
                err.message?.includes("WriteConflict");

            if (isTransientError && attempt < MAX_RETRIES - 1) {
                continue;
            }

            return res.status(500).json({
                message: "Transaction is pending due to some issue. Please try again later"
            });
        } finally {
            if (session) {
                try {
                    await session.endSession();
                } catch (endErr) {}
            }
        }
    }

    if(!transactionCommitted) {
        return res.status(500).json({
            message: "Transaction is pending due to some issue. Please try again later"
        });
    }

    /**
     * Step 10: Send email & in-app notification to sender and receiver
     */
    try {
        await emailService.sendTransactionEmail(req.user.email, req.user.name, amount, toAccount);
    } catch (emailErr) {
        console.error("Failed to send transaction email:", emailErr.message);
    }

    try {
        // Notification for sender
        await notificationService.createNotification({
            recipient: req.user._id,
            type: "TRANSACTION_SENT",
            title: "Money Sent",
            message: `You transferred ₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} to account ${toAccount}.`,
            severity: "INFO",
            relatedResourceType: "TRANSACTION",
            relatedResourceId: transaction._id,
            metadata: {
                amount,
                fromAccount,
                toAccount,
                transactionId: transaction._id
            }
        });

        // Notification for receiver
        if (toUserAccount && toUserAccount.user) {
            await notificationService.createNotification({
                recipient: toUserAccount.user,
                type: "TRANSACTION_RECEIVED",
                title: "Money Received",
                message: `You received ₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} from account ${fromAccount}.`,
                severity: "SUCCESS",
                relatedResourceType: "TRANSACTION",
                relatedResourceId: transaction._id,
                metadata: {
                    amount,
                    fromAccount,
                    toAccount,
                    transactionId: transaction._id
                }
            });
        }
    } catch (notifErr) {
        console.error("Failed to emit transaction notifications:", notifErr.message);
    }

    return res.status(201).json({
        message: "Transaction completed successfully",
        transaction: transaction
    });
}


async function createinitializeFundsTransaction(req, res, next) {
    const { toAccount, amount, idempotencyKey } = req.body;
    if(!toAccount || amount === undefined || amount === null || !idempotencyKey) {
        return res.status(400).json({
            message: "ToAccount, Amount and IdempotencyKey are required to create a transaction",
        })
    }

    if(typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({
            message: "Transaction amount must be a finite number greater than zero"
        })
    }

    if(!mongoose.Types.ObjectId.isValid(toAccount)) {
        return res.status(400).json({
            message: "Invalid toAccount ID"
        })
    }

    /**
     * Validate idempotency key
     */
    const isTransactionAlreadyExists = await transactionModel.findOne({
        idempotencyKey: idempotencyKey
    })
    if(isTransactionAlreadyExists) {
        if(isTransactionAlreadyExists.status === "COMPLETED") {
            return res.status(200).json({
                message: "Transaction with this idempotency key already exists and is completed",
                transaction: isTransactionAlreadyExists
            })
        }
        if(isTransactionAlreadyExists.status === "PENDING") {
            return res.status(200).json({
                message: "Transaction with this idempotency key already exists and is pending"
            })
        }
        if(isTransactionAlreadyExists.status === "FAILED") {
            return res.status(500).json({
                message: "Transaction with this idempotency key already exists and is failed"
            })
        }
        if(isTransactionAlreadyExists.status === "REVERSED") {
            return res.status(500).json({
                message: "Transaction with this idempotency key already exists and is reversed"
            })
        }
    }

    const toUserAccount = await accountModel.findOne({
        _id: toAccount,
    })
    if(!toUserAccount) {
        return res.status(400).json({
            message: "ToAccount not found"
        })
    }

    if(toUserAccount.status !== "ACTIVE") {
        return res.status(400).json({
            message: "Destination account is not active"
        })
    }

    const fromUserAccount = await accountModel.findOne({
        user: req.user._id,
        status: "ACTIVE"
    })
    if(!fromUserAccount) {
        return res.status(400).json({
            message: "System user account not found"
        })
    }

    if(fromUserAccount._id.toString() === toAccount.toString()) {
        return res.status(400).json({
            message: "Source and destination accounts cannot be the same"
        })
    }

    let session;
    let transaction;
    try {
        session = await mongoose.startSession();
        session.startTransaction();

        transaction = new transactionModel({
            fromAccount: fromUserAccount._id,
            toAccount,
            amount,
            idempotencyKey,
            status: "PENDING"
        });
        await transaction.save({ session });

        const debitLadgerEntry = await ladgerModel.create([{
            account: fromUserAccount._id,
            amount: amount,
            transaction: transaction._id,
            type: "DEBIT"
        }], { session });

        const creditLadgerEntry = await ladgerModel.create([{
            account: toAccount,
            amount: amount,
            transaction: transaction._id,
            type: "CREDIT"
        }], { session });

        transaction.status = "COMPLETED";
        await transaction.save({ session });

        await logAuditEvent({
            actor: req.user._id,
            action: "SYSTEM_FUNDS_INITIALIZED",
            resourceType: "TRANSACTION",
            resourceId: transaction._id,
            previousState: null,
            newState: {
                status: "COMPLETED",
                amount: amount,
                fromAccount: fromUserAccount._id,
                toAccount: toAccount
            },
            metadata: {
                idempotencyKey,
                amount,
                fromAccount: fromUserAccount._id,
                toAccount: toAccount
            },
            req
        }, session);

        await session.commitTransaction();
    } catch (err) {
        if (session && session.inTransaction && session.inTransaction()) {
            try {
                await session.abortTransaction();
            } catch (abortErr) {
                // Prevent secondary abort errors from masking primary error
            }
        }

        if (err.code === 11000 || (err.message && err.message.includes("E11000"))) {
            const existingTx = await transactionModel.findOne({ idempotencyKey });
            if (existingTx) {
                if (existingTx.status === "COMPLETED") {
                    return res.status(200).json({
                        message: "Transaction with this idempotency key already exists and is completed",
                        transaction: existingTx
                    });
                }
                if (existingTx.status === "PENDING") {
                    return res.status(200).json({
                        message: "Transaction with this idempotency key already exists and is pending"
                    });
                }
                if (existingTx.status === "FAILED") {
                    return res.status(500).json({
                        message: "Transaction with this idempotency key already exists and is failed"
                    });
                }
                if (existingTx.status === "REVERSED") {
                    return res.status(500).json({
                        message: "Transaction with this idempotency key already exists and is reversed"
                    });
                }
            }
            return res.status(200).json({
                message: "Transaction with this idempotency key already exists and is completed"
            });
        }

        return res.status(500).json({
            message: "Transaction is pending due to some issue. Please try again later"
        });
    } finally {
        if (session) {
            try {
                await session.endSession();
            } catch (endErr) {
                // Ignore secondary cleanup errors
            }
        }
    }

    return res.status(201).json({
        message: "Initial funds transaction completed successfully",
        transaction: transaction
    });
}

/**
 * GET /api/transactions
 * Retrieve paginated and filtered transactions for the currently authenticated user.
 * A transaction is relevant if the user owns either fromAccount or toAccount.
 *
 * Supports query parameters:
 *  - page (default: 1)
 *  - limit (default: 10, max: 50)
 *  - search (Transaction ID, Account ID, or Counterparty/Holder Name)
 *  - fromDate (YYYY-MM-DD)
 *  - toDate (YYYY-MM-DD)
 *  - type (ALL, CREDIT, DEBIT)
 *  - status (ALL, PENDING, COMPLETED, FAILED, REVERSED)
 */
async function getTransactions(req, res, next) {
    try {
        const userId = req.user._id;

        // 1. Find all accounts belonging to the authenticated user
        const userAccounts = await accountModel.find({ user: userId }).select('_id');
        const userAccountIds = userAccounts.map(acc => acc._id);

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const rawFromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : '';
        const rawToDate = typeof req.query.toDate === 'string' ? req.query.toDate.trim() : '';
        const rawType = typeof req.query.type === 'string' ? req.query.type.trim().toUpperCase() : 'ALL';
        const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : 'ALL';

        if (userAccountIds.length === 0) {
            return res.status(200).json({
                transactions: [],
                pagination: {
                    page,
                    limit,
                    totalCount: 0,
                    totalPages: 0,
                    hasNextPage: false,
                    hasPrevPage: false
                },
                filters: {
                    search: rawSearch,
                    fromDate: rawFromDate || null,
                    toDate: rawToDate || null,
                    type: rawType,
                    status: rawStatus
                }
            });
        }

        // 2. Base Ownership and Direction Filter
        const queryConditions = [];

        if (rawType === 'CREDIT') {
            // Incoming to user's accounts
            queryConditions.push({ toAccount: { $in: userAccountIds } });
        } else if (rawType === 'DEBIT') {
            // Outgoing from user's accounts
            queryConditions.push({ fromAccount: { $in: userAccountIds } });
        } else {
            // ALL (user is sender or receiver)
            queryConditions.push({
                $or: [
                    { fromAccount: { $in: userAccountIds } },
                    { toAccount: { $in: userAccountIds } }
                ]
            });
        }

        // 3. Status Filter
        const validStatuses = ['PENDING', 'COMPLETED', 'FAILED', 'REVERSED'];
        if (rawStatus !== 'ALL' && validStatuses.includes(rawStatus)) {
            queryConditions.push({ status: rawStatus });
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

        // 5. Search Filter (Transaction ID, Account ID, or Counterparty/Holder Name)
        if (rawSearch) {
            const isObjectId = /^[0-9a-fA-F]{24}$/.test(rawSearch);
            if (isObjectId) {
                const searchObjId = new mongoose.Types.ObjectId(rawSearch);
                queryConditions.push({
                    $or: [
                        { _id: searchObjId },
                        { fromAccount: searchObjId },
                        { toAccount: searchObjId }
                    ]
                });
            } else {
                // Name search: find matching accounts by accountHolderName, user name, or application fullName
                const escaped = rawSearch.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
                const nameRegex = new RegExp(escaped, 'i');

                const [matchingUsers, matchingApps] = await Promise.all([
                    userModel.find({ name: nameRegex }).select('_id').lean(),
                    accountApplicationModel.find({ fullName: nameRegex }).select('createdAccount').lean()
                ]);

                const matchingUserIds = matchingUsers.map(u => u._id);
                const matchingAppAccountIds = matchingApps
                    .filter(a => a.createdAccount)
                    .map(a => a.createdAccount);

                const matchingAccounts = await accountModel.find({
                    $or: [
                        { accountHolderName: nameRegex },
                        { user: { $in: matchingUserIds } },
                        { _id: { $in: matchingAppAccountIds } }
                    ]
                }).select('_id').lean();

                const matchingAccountIds = matchingAccounts.map(a => a._id);

                if (matchingAccountIds.length > 0) {
                    queryConditions.push({
                        $or: [
                            { fromAccount: { $in: matchingAccountIds } },
                            { toAccount: { $in: matchingAccountIds } }
                        ]
                    });
                } else {
                    // No matching counterparty/accounts found for search text
                    return res.status(200).json({
                        transactions: [],
                        pagination: {
                            page,
                            limit,
                            totalCount: 0,
                            totalPages: 0,
                            hasNextPage: false,
                            hasPrevPage: false
                        },
                        filters: {
                            search: rawSearch,
                            fromDate: rawFromDate || null,
                            toDate: rawToDate || null,
                            type: rawType,
                            status: rawStatus
                        }
                    });
                }
            }
        }

        const finalQuery = queryConditions.length === 1
            ? queryConditions[0]
            : { $and: queryConditions };

        // 6. Count Total Matching Documents & Paginate
        const totalCount = await transactionModel.countDocuments(finalQuery);
        const totalPages = Math.ceil(totalCount / limit) || 0;
        const skip = (page - 1) * limit;

        const transactions = await transactionModel
            .find(finalQuery)
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        if (transactions.length === 0) {
            return res.status(200).json({
                transactions: [],
                pagination: {
                    page,
                    limit,
                    totalCount,
                    totalPages,
                    hasNextPage: false,
                    hasPrevPage: page > 1
                },
                filters: {
                    search: rawSearch,
                    fromDate: rawFromDate || null,
                    toDate: rawToDate || null,
                    type: rawType,
                    status: rawStatus
                }
            });
        }

        // 7. Resolve all involved accounts to retrieve accountHolderName safely for this page only
        const pageAccountIds = new Set();
        transactions.forEach(t => {
            if (t.fromAccount) pageAccountIds.add(t.fromAccount.toString());
            if (t.toAccount) pageAccountIds.add(t.toAccount.toString());
        });

        const accountsList = await accountModel
            .find({ _id: { $in: Array.from(pageAccountIds) } })
            .populate('user', 'name email')
            .lean();

        // Check linked applications for legacy accounts missing accountHolderName
        const legacyAccountIds = accountsList
            .filter(acc => !acc.accountHolderName)
            .map(acc => acc._id);

        const linkedApps = legacyAccountIds.length > 0
            ? await accountApplicationModel
                .find({ createdAccount: { $in: legacyAccountIds } })
                .select('createdAccount fullName')
                .lean()
            : [];

        const appNameMap = new Map();
        linkedApps.forEach(app => {
            if (app.createdAccount && app.fullName) {
                appNameMap.set(app.createdAccount.toString(), app.fullName);
            }
        });

        const accountMap = new Map();
        accountsList.forEach(acc => {
            const accIdStr = acc._id.toString();
            const holderName =
                acc.accountHolderName ||
                appNameMap.get(accIdStr) ||
                acc.user?.name ||
                'Account Holder';

            accountMap.set(accIdStr, {
                _id: accIdStr,
                accountHolderName: holderName,
                accountType: acc.accountType || 'SAVINGS',
                currency: acc.currency || 'INR',
                status: acc.status || 'ACTIVE'
            });
        });

        // 8. Format transactions response without exposing sensitive data
        const formattedTransactions = transactions.map(tx => {
            const fromId = tx.fromAccount ? tx.fromAccount.toString() : '';
            const toId = tx.toAccount ? tx.toAccount.toString() : '';

            const fromInfo = accountMap.get(fromId);
            const toInfo = accountMap.get(toId);

            return {
                _id: tx._id,
                fromAccount: fromId,
                toAccount: toId,
                fromAccountHolderName: fromInfo?.accountHolderName || 'Account Holder',
                toAccountHolderName: toInfo?.accountHolderName || 'Account Holder',
                amount: tx.amount,
                status: tx.status || 'COMPLETED',
                idempotencyKey: tx.idempotencyKey,
                reversalReason: tx.reversalReason || null,
                reversedAt: tx.reversedAt || null,
                reversedBy: tx.reversedBy || null,
                createdAt: tx.createdAt,
                updatedAt: tx.updatedAt
            };
        });

        return res.status(200).json({
            transactions: formattedTransactions,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            },
            filters: {
                search: rawSearch,
                fromDate: rawFromDate || null,
                toDate: rawToDate || null,
                type: rawType,
                status: rawStatus
            }
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/transactions/summary
 * Retrieve aggregate transaction financial summary for the currently authenticated user.
 * Exactly matches Dashboard metrics:
 *  - totalCredits: sum of COMPLETED transactions where toAccount is in user's accounts
 *  - totalDebits: sum of COMPLETED transactions where fromAccount is in user's accounts
 *  - netMovement: totalCredits - totalDebits
 *  - totalTransactions: total relevant COMPLETED transactions count
 */
async function getTransactionSummary(req, res, next) {
    try {
        const userId = req.user._id;

        // 1. Find all accounts belonging to the authenticated user
        const userAccounts = await accountModel.find({ user: userId }).select('_id');
        const userAccountIds = userAccounts.map(acc => acc._id);

        if (userAccountIds.length === 0) {
            return res.status(200).json({
                totalCredits: 0,
                totalDebits: 0,
                netMovement: 0,
                totalTransactions: 0
            });
        }

        // 2. Fetch all completed transactions involving user's accounts
        const completedTransactions = await transactionModel.find({
            status: 'COMPLETED',
            $or: [
                { fromAccount: { $in: userAccountIds } },
                { toAccount: { $in: userAccountIds } }
            ]
        }).select('fromAccount toAccount amount').lean();

        const userAccountSet = new Set(userAccountIds.map(id => id.toString()));

        let totalCredits = 0;
        let totalDebits = 0;

        completedTransactions.forEach(tx => {
            const isSender = tx.fromAccount && userAccountSet.has(tx.fromAccount.toString());
            const isReceiver = tx.toAccount && userAccountSet.has(tx.toAccount.toString());

            if (isReceiver && !isSender) {
                // Incoming funds from external/system party
                totalCredits += tx.amount || 0;
            } else if (isSender && !isReceiver) {
                // Outgoing funds to external party
                totalDebits += tx.amount || 0;
            } else if (isSender && isReceiver) {
                // Internal transfer between user's own accounts: both debit and credit occur within user domain
                totalCredits += tx.amount || 0;
                totalDebits += tx.amount || 0;
            }
        });

        const netMovement = totalCredits - totalDebits;

        return res.status(200).json({
            totalCredits,
            totalDebits,
            netMovement,
            totalTransactions: completedTransactions.length
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/transactions/:id/reverse
 * Administratively reverse an eligible completed transaction by inserting compensating double-entry ledger entries.
 * (System User only)
 */
async function reverseTransactionController(req, res, next) {
    try {
        const { id } = req.params;
        const { reason } = req.body || {};

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid transaction ID"
            });
        }

        if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
            return res.status(400).json({
                status: "error",
                message: "A reason of at least 5 characters is required for reversing a transaction"
            });
        }

        const trimmedReason = reason.trim();
        if (trimmedReason.length > 500) {
            return res.status(400).json({
                status: "error",
                message: "Reason cannot exceed 500 characters"
            });
        }

        const MAX_RETRIES = 3;
        let reversalSuccess = false;
        let reversedTransaction = null;
        let fromAccHolderName = "Account Holder";
        let toAccHolderName = "Account Holder";
        let fromAccUserId = null;
        let toAccUserId = null;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            let session;
            try {
                session = await mongoose.startSession();
                session.startTransaction();

                // 1. Atomic state lock on transaction (only transition if currently COMPLETED)
                const lockedTx = await transactionModel.findOneAndUpdate(
                    { _id: id, status: "COMPLETED" },
                    {
                        $set: {
                            status: "REVERSED",
                            reversalReason: trimmedReason,
                            reversedAt: new Date(),
                            reversedBy: req.user._id
                        },
                        $inc: { __v: 1 }
                    },
                    { session, returnDocument: "after" }
                );

                if (!lockedTx) {
                    await session.abortTransaction();
                    const existingTx = await transactionModel.findById(id);
                    if (!existingTx) {
                        return res.status(404).json({
                            status: "error",
                            message: "Transaction not found"
                        });
                    }
                    if (existingTx.status === "REVERSED") {
                        return res.status(400).json({
                            status: "error",
                            message: "Transaction has already been reversed"
                        });
                    }
                    return res.status(400).json({
                        status: "error",
                        message: `Cannot reverse transaction with status ${existingTx.status}`
                    });
                }

                // 2. Lock both involved accounts and verify receiver balance
                const fromAccountDoc = await accountModel.findOneAndUpdate(
                    { _id: lockedTx.fromAccount },
                    { $inc: { __v: 1 } },
                    { session, returnDocument: "after" }
                );
                const toAccountDoc = await accountModel.findOneAndUpdate(
                    { _id: lockedTx.toAccount },
                    { $inc: { __v: 1 } },
                    { session, returnDocument: "after" }
                );

                if (!fromAccountDoc || !toAccountDoc) {
                    await session.abortTransaction();
                    return res.status(400).json({
                        status: "error",
                        message: "One or both accounts associated with this transaction could not be found"
                    });
                }

                // 3. Balance safety rule: Destination account must have sufficient balance to cover the debit reversal
                const receiverBalance = await toAccountDoc.getBalance(session);
                if (receiverBalance < lockedTx.amount) {
                    await session.abortTransaction();
                    return res.status(400).json({
                        status: "error",
                        message: `Cannot reverse transaction: Destination account has insufficient available balance (${receiverBalance}) to debit the reversal amount (${lockedTx.amount})`
                    });
                }

                // 4. Create compensating double-entry ledger entries
                // Debit original receiver (toAccount)
                await ladgerModel.create([
                    {
                        account: lockedTx.toAccount,
                        amount: lockedTx.amount,
                        transaction: lockedTx._id,
                        type: "DEBIT"
                    }
                ], { session });

                // Credit original sender (fromAccount)
                await ladgerModel.create([
                    {
                        account: lockedTx.fromAccount,
                        amount: lockedTx.amount,
                        transaction: lockedTx._id,
                        type: "CREDIT"
                    }
                ], { session });

                await logAuditEvent({
                    actor: req.user._id,
                    action: "TRANSACTION_REVERSED",
                    resourceType: "TRANSACTION",
                    resourceId: lockedTx._id,
                    previousState: { status: "COMPLETED" },
                    newState: { status: "REVERSED" },
                    reason: trimmedReason,
                    metadata: {
                        amount: lockedTx.amount,
                        fromAccount: lockedTx.fromAccount,
                        toAccount: lockedTx.toAccount,
                        fromAccountHolderName: fromAccountDoc.accountHolderName || "Account Holder",
                        toAccountHolderName: toAccountDoc.accountHolderName || "Account Holder"
                    },
                    req
                }, session);

                await session.commitTransaction();
                reversalSuccess = true;
                reversedTransaction = lockedTx;
                fromAccHolderName = fromAccountDoc.accountHolderName || "Account Holder";
                toAccHolderName = toAccountDoc.accountHolderName || "Account Holder";
                fromAccUserId = fromAccountDoc.user;
                toAccUserId = toAccountDoc.user;
                break;
            } catch (err) {
                if (session && session.inTransaction && session.inTransaction()) {
                    try {
                        await session.abortTransaction();
                    } catch (abortErr) {}
                }

                const isTransient =
                    (err.hasErrorLabel && err.hasErrorLabel("TransientTransactionError")) ||
                    err.code === 112 ||
                    err.message?.includes("WriteConflict");

                if (isTransient && attempt < MAX_RETRIES - 1) {
                    continue;
                }

                if (isTransient) {
                    const checkTx = await transactionModel.findById(id);
                    if (checkTx && checkTx.status === "REVERSED") {
                        return res.status(400).json({
                            status: "error",
                            message: "Transaction has already been reversed"
                        });
                    }
                    return res.status(409).json({
                        status: "error",
                        message: "Transaction is currently being processed by another concurrent request. Please try again."
                    });
                }

                return next(err);
            } finally {
                if (session) {
                    try {
                        await session.endSession();
                    } catch (endErr) {}
                }
            }
        }

        if (!reversalSuccess || !reversedTransaction) {
            return res.status(500).json({
                status: "error",
                message: "Failed to reverse transaction due to a concurrent conflict. Please try again."
            });
        }

        try {
            // Notification to original sender (funds refunded)
            if (fromAccUserId) {
                await notificationService.createNotification({
                    recipient: fromAccUserId,
                    type: "TRANSACTION_REVERSED",
                    title: "Transaction Refunded",
                    message: `Transaction of ₹${Number(reversedTransaction.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} has been reversed and credited back to your account. Reason: ${trimmedReason}`,
                    severity: "SUCCESS",
                    relatedResourceType: "TRANSACTION",
                    relatedResourceId: reversedTransaction._id,
                    metadata: {
                        amount: reversedTransaction.amount,
                        fromAccount: reversedTransaction.fromAccount,
                        reason: trimmedReason,
                        transactionId: reversedTransaction._id
                    }
                });
            }

            // Notification to original receiver (funds debited back)
            if (toAccUserId) {
                await notificationService.createNotification({
                    recipient: toAccUserId,
                    type: "TRANSACTION_REVERSED",
                    title: "Transaction Reversed",
                    message: `Transaction of ₹${Number(reversedTransaction.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })} has been reversed and debited from your account. Reason: ${trimmedReason}`,
                    severity: "WARNING",
                    relatedResourceType: "TRANSACTION",
                    relatedResourceId: reversedTransaction._id,
                    metadata: {
                        amount: reversedTransaction.amount,
                        toAccount: reversedTransaction.toAccount,
                        reason: trimmedReason,
                        transactionId: reversedTransaction._id
                    }
                });
            }
        } catch (notifErr) {
            console.error("Failed to emit reversal notifications:", notifErr.message);
        }

        return res.status(200).json({
            status: "success",
            message: `Transaction ${reversedTransaction._id} successfully reversed`,
            transaction: {
                _id: reversedTransaction._id,
                fromAccount: reversedTransaction.fromAccount,
                toAccount: reversedTransaction.toAccount,
                fromAccountHolderName: fromAccHolderName,
                toAccountHolderName: toAccHolderName,
                amount: reversedTransaction.amount,
                status: reversedTransaction.status,
                idempotencyKey: reversedTransaction.idempotencyKey,
                reversalReason: reversedTransaction.reversalReason,
                reversedAt: reversedTransaction.reversedAt,
                reversedBy: reversedTransaction.reversedBy,
                createdAt: reversedTransaction.createdAt,
                updatedAt: reversedTransaction.updatedAt
            },
            audit: {
                transactionId: reversedTransaction._id,
                originalStatus: "COMPLETED",
                newStatus: "REVERSED",
                amount: reversedTransaction.amount,
                fromAccount: reversedTransaction.fromAccount,
                toAccount: reversedTransaction.toAccount,
                reason: trimmedReason,
                performedBy: {
                    _id: req.user._id,
                    name: req.user.name,
                    email: req.user.email
                },
                timestamp: reversedTransaction.reversedAt
            }
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/transactions/system/all
 * Retrieve paginated and filtered transactions across the entire system (System User only).
 */
async function getSystemTransactionsController(req, res, next) {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const rawFromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate.trim() : '';
        const rawToDate = typeof req.query.toDate === 'string' ? req.query.toDate.trim() : '';
        const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : 'ALL';

        const queryConditions = [];

        // 1. Status Filter
        const validStatuses = ['PENDING', 'COMPLETED', 'FAILED', 'REVERSED'];
        if (rawStatus !== 'ALL' && validStatuses.includes(rawStatus)) {
            queryConditions.push({ status: rawStatus });
        }

        // 2. Date Range Filter
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

        // 3. Search Filter
        if (rawSearch) {
            const isObjectId = /^[0-9a-fA-F]{24}$/.test(rawSearch);
            if (isObjectId) {
                const searchObjId = new mongoose.Types.ObjectId(rawSearch);
                queryConditions.push({
                    $or: [
                        { _id: searchObjId },
                        { fromAccount: searchObjId },
                        { toAccount: searchObjId }
                    ]
                });
            } else {
                const escaped = rawSearch.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
                const nameRegex = new RegExp(escaped, 'i');

                const [matchingUsers, matchingApps] = await Promise.all([
                    userModel.find({ name: nameRegex }).select('_id').lean(),
                    accountApplicationModel.find({ fullName: nameRegex }).select('createdAccount').lean()
                ]);

                const matchingUserIds = matchingUsers.map(u => u._id);
                const matchingAppAccountIds = matchingApps
                    .filter(a => a.createdAccount)
                    .map(a => a.createdAccount);

                const matchingAccounts = await accountModel.find({
                    $or: [
                        { accountHolderName: nameRegex },
                        { user: { $in: matchingUserIds } },
                        { _id: { $in: matchingAppAccountIds } }
                    ]
                }).select('_id').lean();

                const matchingAccountIds = matchingAccounts.map(a => a._id);

                if (matchingAccountIds.length > 0) {
                    queryConditions.push({
                        $or: [
                            { fromAccount: { $in: matchingAccountIds } },
                            { toAccount: { $in: matchingAccountIds } }
                        ]
                    });
                } else {
                    return res.status(200).json({
                        transactions: [],
                        pagination: {
                            page,
                            limit,
                            totalCount: 0,
                            totalPages: 0,
                            hasNextPage: false,
                            hasPrevPage: false
                        },
                        filters: {
                            search: rawSearch,
                            fromDate: rawFromDate || null,
                            toDate: rawToDate || null,
                            status: rawStatus
                        }
                    });
                }
            }
        }

        const finalQuery = queryConditions.length === 0
            ? {}
            : queryConditions.length === 1
            ? queryConditions[0]
            : { $and: queryConditions };

        const totalCount = await transactionModel.countDocuments(finalQuery);
        const totalPages = Math.ceil(totalCount / limit) || 0;
        const skip = (page - 1) * limit;

        const transactions = await transactionModel
            .find(finalQuery)
            .populate('reversedBy', 'name email')
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        if (transactions.length === 0) {
            return res.status(200).json({
                transactions: [],
                pagination: {
                    page,
                    limit,
                    totalCount,
                    totalPages,
                    hasNextPage: false,
                    hasPrevPage: page > 1
                },
                filters: {
                    search: rawSearch,
                    fromDate: rawFromDate || null,
                    toDate: rawToDate || null,
                    status: rawStatus
                }
            });
        }

        const pageAccountIds = new Set();
        transactions.forEach(t => {
            if (t.fromAccount) pageAccountIds.add(t.fromAccount.toString());
            if (t.toAccount) pageAccountIds.add(t.toAccount.toString());
        });

        const accountsList = await accountModel
            .find({ _id: { $in: Array.from(pageAccountIds) } })
            .populate('user', 'name email')
            .lean();

        const legacyAccountIds = accountsList
            .filter(acc => !acc.accountHolderName)
            .map(acc => acc._id);

        const linkedApps = legacyAccountIds.length > 0
            ? await accountApplicationModel
                .find({ createdAccount: { $in: legacyAccountIds } })
                .select('createdAccount fullName')
                .lean()
            : [];

        const appNameMap = new Map();
        linkedApps.forEach(app => {
            if (app.createdAccount && app.fullName) {
                appNameMap.set(app.createdAccount.toString(), app.fullName);
            }
        });

        const accountMap = new Map();
        accountsList.forEach(acc => {
            const accIdStr = acc._id.toString();
            const holderName =
                acc.accountHolderName ||
                appNameMap.get(accIdStr) ||
                acc.user?.name ||
                'Account Holder';

            accountMap.set(accIdStr, {
                _id: accIdStr,
                accountHolderName: holderName,
                accountType: acc.accountType || 'SAVINGS',
                currency: acc.currency || 'INR',
                status: acc.status || 'ACTIVE'
            });
        });

        const formattedTransactions = transactions.map(tx => {
            const fromId = tx.fromAccount ? tx.fromAccount.toString() : '';
            const toId = tx.toAccount ? tx.toAccount.toString() : '';

            const fromInfo = accountMap.get(fromId);
            const toInfo = accountMap.get(toId);

            return {
                _id: tx._id,
                fromAccount: fromId,
                toAccount: toId,
                fromAccountHolderName: fromInfo?.accountHolderName || 'Account Holder',
                toAccountHolderName: toInfo?.accountHolderName || 'Account Holder',
                amount: tx.amount,
                status: tx.status || 'COMPLETED',
                idempotencyKey: tx.idempotencyKey,
                reversalReason: tx.reversalReason || null,
                reversedAt: tx.reversedAt || null,
                reversedBy: tx.reversedBy
                    ? {
                        _id: tx.reversedBy._id,
                        name: tx.reversedBy.name,
                        email: tx.reversedBy.email
                    }
                    : null,
                createdAt: tx.createdAt,
                updatedAt: tx.updatedAt
            };
        });

        return res.status(200).json({
            transactions: formattedTransactions,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            },
            filters: {
                search: rawSearch,
                fromDate: rawFromDate || null,
                toDate: rawToDate || null,
                status: rawStatus
            }
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    createTransaction,
    createinitializeFundsTransaction,
    getTransactions,
    getTransactionSummary,
    reverseTransactionController,
    getSystemTransactionsController
};

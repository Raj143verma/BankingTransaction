const transactionModel = require("../models/transaction.model")
const ladgerModel = require("../models/ladger.model")
const accountModel = require("../models/account.model")
const accountApplicationModel = require("../models/accountApplication.model")
const userModel = require("../models/user.model")
const mongoose = require("mongoose")
const emailService = require("../services/email.service")



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

async function createTransaction(req,res) {
    

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

            // Step 4a: Atomic document write/touch on source account inside transaction to establish serialization lock
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

            // Step 4b: Derive sender balance from ledger within active session
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
     * Step 10: Send email notification to sender and receiver
     */
    try {
        await emailService.sendTransactionEmail(req.user.email, req.user.name, amount, toAccount);
    } catch (emailErr) {
        console.error("Failed to send transaction email:", emailErr.message);
    }

    return res.status(201).json({
        message: "Transaction completed successfully",
        transaction: transaction
    });
}
   

async function createinitializeFundsTransaction(req,res) {
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
async function getTransactions(req, res) {
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
        return res.status(500).json({
            message: err.message || "Failed to fetch transactions"
        });
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
async function getTransactionSummary(req, res) {
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
        return res.status(500).json({
            message: err.message || "Failed to calculate transaction summary"
        });
    }
}

module.exports = {
    createTransaction,
    createinitializeFundsTransaction,
    getTransactions,
    getTransactionSummary
}
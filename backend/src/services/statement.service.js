const mongoose = require('mongoose');
const accountModel = require('../models/account.model');
const ladgerModel = require('../models/ladger.model');
const transactionModel = require('../models/transaction.model');
const userModel = require('../models/user.model');
const accountApplicationModel = require('../models/accountApplication.model');
const PDFDocument = require('pdfkit');

/**
 * Service to calculate and format authoritative account statements using double-entry ledger records.
 */

/**
 * Helper to format currency numbers cleanly to 2 decimal places.
 */
function roundCurrency(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}

/**
 * Generate comprehensive account statement for a given account and optional date range.
 *
 * @param {Object} params
 * @param {string} params.accountId - The account ObjectId
 * @param {Object} params.user - The requesting user object (from auth middleware)
 * @param {boolean} params.isSystemUser - Whether requesting user is a system admin
 * @param {string} [params.startDate] - Optional start date (ISO string or YYYY-MM-DD)
 * @param {string} [params.endDate] - Optional end date (ISO string or YYYY-MM-DD)
 * @param {number} [params.page=1] - Page number for pagination
 * @param {number} [params.limit=50] - Number of items per page
 * @returns {Promise<Object>} Normalized statement data
 */
async function generateAccountStatement({
  accountId,
  user,
  isSystemUser = false,
  startDate = null,
  endDate = null,
  page = 1,
  limit = 50,
}) {
  // 1. Validate Account ObjectId
  if (!mongoose.Types.ObjectId.isValid(accountId)) {
    const err = new Error('Invalid account ID format');
    err.statusCode = 400;
    throw err;
  }

  // 2. Lookup Account
  const account = await accountModel
    .findById(accountId)
    .populate('user', 'name email systemUser')
    .lean();

  if (!account) {
    const err = new Error('Account not found');
    err.statusCode = 404;
    throw err;
  }

  // 3. IDOR & Authorization Check
  const isOwner =
    account.user &&
    account.user._id &&
    account.user._id.toString() === user._id.toString();

  if (!isOwner && !isSystemUser) {
    const err = new Error(
      'Unauthorized: You do not have permission to view this account statement'
    );
    err.statusCode = 403;
    throw err;
  }

  // 4. Resolve Account Holder Name
  let resolvedHolderName = account.accountHolderName;
  if (!resolvedHolderName) {
    const linkedApp = await accountApplicationModel
      .findOne({ createdAccount: account._id })
      .select('fullName')
      .lean();
    resolvedHolderName =
      linkedApp?.fullName || account.user?.name || 'Account Holder';
  }

  // 5. Parse and Validate Date Range
  let startBoundary = null;
  let endBoundary = null;

  if (startDate) {
    const parsedStart = new Date(startDate);
    if (isNaN(parsedStart.getTime())) {
      const err = new Error('Invalid startDate format');
      err.statusCode = 400;
      throw err;
    }
    // If date-only string like YYYY-MM-DD, set to start of day UTC
    if (typeof startDate === 'string' && startDate.length <= 10) {
      const [year, month, day] = startDate.split('-').map(Number);
      startBoundary = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    } else {
      startBoundary = parsedStart;
    }
  }

  if (endDate) {
    const parsedEnd = new Date(endDate);
    if (isNaN(parsedEnd.getTime())) {
      const err = new Error('Invalid endDate format');
      err.statusCode = 400;
      throw err;
    }
    // If date-only string like YYYY-MM-DD, set to end of day UTC
    if (typeof endDate === 'string' && endDate.length <= 10) {
      const [year, month, day] = endDate.split('-').map(Number);
      endBoundary = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    } else {
      endBoundary = parsedEnd;
    }
  }

  if (startBoundary && endBoundary && startBoundary > endBoundary) {
    const err = new Error('startDate cannot be after endDate');
    err.statusCode = 400;
    throw err;
  }

  // 6. Fetch all double-entry ledger records for this account
  const ledgerEntries = await ladgerModel
    .find({ account: account._id })
    .populate({
      path: 'transaction',
      model: 'Transaction',
      select:
        'fromAccount toAccount amount status idempotencyKey reversalReason reversedAt reversedBy createdAt updatedAt',
    })
    .lean();


  // 7. Collect unique counterparty account IDs for name resolution
  const counterpartyAccountIds = new Set();
  ledgerEntries.forEach((entry) => {
    const tx = entry.transaction;
    if (tx) {
      if (
        tx.fromAccount &&
        tx.fromAccount.toString() !== account._id.toString()
      ) {
        counterpartyAccountIds.add(tx.fromAccount.toString());
      }
      if (tx.toAccount && tx.toAccount.toString() !== account._id.toString()) {
        counterpartyAccountIds.add(tx.toAccount.toString());
      }
    }
  });

  const [counterpartyAccounts, counterpartyApps] = await Promise.all([
    accountModel
      .find({ _id: { $in: Array.from(counterpartyAccountIds) } })
      .populate('user', 'name')
      .lean(),
    accountApplicationModel
      .find({ createdAccount: { $in: Array.from(counterpartyAccountIds) } })
      .select('createdAccount fullName')
      .lean(),
  ]);

  const counterpartyNameMap = new Map();
  counterpartyAccounts.forEach((acc) => {
    const app = counterpartyApps.find(
      (a) =>
        a.createdAccount &&
        a.createdAccount.toString() === acc._id.toString()
    );
    const name =
      acc.accountHolderName || app?.fullName || acc.user?.name || 'Account Holder';
    counterpartyNameMap.set(acc._id.toString(), {
      name,
      accountType: acc.accountType,
    });
  });

  // 8. Process and Classify all Ledger Entries
  const processedEntries = ledgerEntries.map((entry) => {
    const tx = entry.transaction || {};
    const entryIdTime = entry._id ? entry._id.getTimestamp() : new Date();

    // Determine if this ledger row is a compensating reversal entry
    const isFromAcc =
      tx.fromAccount && tx.fromAccount.toString() === account._id.toString();
    const isToAcc =
      tx.toAccount && tx.toAccount.toString() === account._id.toString();

    const isReversalCompensating =
      tx.status === 'REVERSED' &&
      ((isFromAcc && entry.type === 'CREDIT') ||
        (isToAcc && entry.type === 'DEBIT'));

    // Determine authoritative chronological timestamp
    let effectiveDate;
    if (isReversalCompensating && tx.reversedAt) {
      effectiveDate = new Date(tx.reversedAt);
    } else if (tx.createdAt) {
      effectiveDate = new Date(tx.createdAt);
    } else {
      effectiveDate = entryIdTime;
    }

    const isCredit = entry.type === 'CREDIT';
    const creditAmount = isCredit ? roundCurrency(entry.amount) : 0;
    const debitAmount = !isCredit ? roundCurrency(entry.amount) : 0;

    // Determine counterparty details
    let counterpartyId = null;
    let counterpartyInfo = null;

    if (isFromAcc && tx.toAccount) {
      counterpartyId = tx.toAccount.toString();
      counterpartyInfo = counterpartyNameMap.get(counterpartyId) || null;
    } else if (isToAcc && tx.fromAccount) {
      counterpartyId = tx.fromAccount.toString();
      counterpartyInfo = counterpartyNameMap.get(counterpartyId) || null;
    }

    // Determine clean presentation transaction type & description
    let transactionType = 'TRANSFER';
    let description = '';

    if (isReversalCompensating) {
      if (isCredit) {
        transactionType = 'REVERSAL_REFUND';
        description = tx.reversalReason
          ? `Reversal Refund: ${tx.reversalReason}`
          : 'Reversal Refund for transaction';
      } else {
        transactionType = 'REVERSAL_DEBIT';
        description = tx.reversalReason
          ? `Reversal Debit: ${tx.reversalReason}`
          : 'Compensating Reversal Debit';
      }
    } else if (!counterpartyId || counterpartyInfo?.name?.includes('System')) {
      transactionType = 'SYSTEM_FUND';
      description = isCredit
        ? 'Initial Deposit / System Reserve Allocation'
        : 'System Fund Transfer';
    } else {
      transactionType = 'TRANSFER';
      description = isCredit
        ? `Transfer from ${counterpartyInfo?.name || 'Customer'}`
        : `Transfer to ${counterpartyInfo?.name || 'Customer'}`;
    }

    return {
      entryId: entry._id.toString(),
      transactionId: tx._id ? tx._id.toString() : entry._id.toString(),
      idempotencyKey: tx.idempotencyKey || null,
      date: effectiveDate,
      type: transactionType,
      ledgerType: entry.type,
      description,
      counterparty: counterpartyInfo
        ? {
            id: counterpartyId,
            name: counterpartyInfo.name,
            accountType: counterpartyInfo.accountType,
          }
        : null,
      debit: debitAmount,
      credit: creditAmount,
      status: tx.status || 'COMPLETED',
      reversalReason: tx.reversalReason || null,
      reversedAt: tx.reversedAt || null,
      isReversalCompensating,
    };
  });

  // 9. Sort strictly in ascending chronological order with stable tie-breaker
  processedEntries.sort((a, b) => {
    const timeDiff = a.date.getTime() - b.date.getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.entryId.localeCompare(b.entryId);
  });

  // 10. Compute Opening Balance (Entries strictly before startBoundary)
  let openingBalance = 0;
  const periodEntries = [];

  for (const item of processedEntries) {
    if (startBoundary && item.date < startBoundary) {
      openingBalance += item.credit - item.debit;
    } else if (!endBoundary || item.date <= endBoundary) {
      periodEntries.push(item);
    }
  }

  openingBalance = roundCurrency(openingBalance);

  // 11. Calculate Sequential Running Balances for all Period Entries
  let currentRunning = openingBalance;
  let totalPeriodCredits = 0;
  let totalPeriodDebits = 0;

  for (const item of periodEntries) {
    currentRunning = roundCurrency(currentRunning + item.credit - item.debit);
    item.runningBalance = currentRunning;
    totalPeriodCredits = roundCurrency(totalPeriodCredits + item.credit);
    totalPeriodDebits = roundCurrency(totalPeriodDebits + item.debit);
  }

  const closingBalance = roundCurrency(
    openingBalance + totalPeriodCredits - totalPeriodDebits
  );

  // 12. Apply Pagination to Period Entries
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const totalCount = periodEntries.length;
  const totalPages = Math.ceil(totalCount / safeLimit) || 1;
  const startIndex = (safePage - 1) * safeLimit;
  const paginatedTransactions = periodEntries.slice(
    startIndex,
    startIndex + safeLimit
  );

  return {
    account: {
      _id: account._id.toString(),
      accountHolderName: resolvedHolderName,
      accountType: account.accountType,
      currency: account.currency || 'INR',
      status: account.status,
      user: {
        _id: account.user?._id?.toString() || null,
        name: account.user?.name || resolvedHolderName,
        email: account.user?.email || null,
      },
    },
    statementPeriod: {
      startDate: startBoundary ? startBoundary.toISOString() : null,
      endDate: endBoundary ? endBoundary.toISOString() : null,
      isDateFiltered: Boolean(startBoundary || endBoundary),
    },
    summary: {
      openingBalance,
      totalCredits: totalPeriodCredits,
      totalDebits: totalPeriodDebits,
      closingBalance,
      netMovement: roundCurrency(totalPeriodCredits - totalPeriodDebits),
      transactionCount: totalCount,
    },
    transactions: paginatedTransactions,
    allPeriodTransactions: periodEntries, // Used internally for full PDF/CSV export
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate an RFC-4180 compliant CSV string from statement data.
 *
 * @param {Object} statementData
 * @returns {string} CSV text
 */
function generateStatementCsv(statementData) {
  const { account, statementPeriod, summary, allPeriodTransactions, generatedAt } =
    statementData;

  const lines = [];

  // Metadata Header Block
  lines.push(`"BANKING TRANSACTION SYSTEM - ACCOUNT STATEMENT"`);
  lines.push(`"Account Holder","${(account.accountHolderName || '').replace(/"/g, '""')}"`);
  lines.push(`"Account Number","${account._id}"`);
  lines.push(`"Account Type","${account.accountType}"`);
  lines.push(`"Currency","${account.currency}"`);
  lines.push(
    `"Statement Period","${
      statementPeriod.startDate
        ? statementPeriod.startDate.substring(0, 10)
        : 'Earliest'
    } to ${
      statementPeriod.endDate
        ? statementPeriod.endDate.substring(0, 10)
        : 'Latest'
    }"`
  );
  lines.push(`"Generated At","${generatedAt}"`);
  lines.push('');

  // Financial Summary Block
  lines.push(`"FINANCIAL SUMMARY"`);
  lines.push(`"Opening Balance","${summary.openingBalance.toFixed(2)}"`);
  lines.push(`"Total Credits","${summary.totalCredits.toFixed(2)}"`);
  lines.push(`"Total Debits","${summary.totalDebits.toFixed(2)}"`);
  lines.push(`"Net Movement","${summary.netMovement.toFixed(2)}"`);
  lines.push(`"Closing Balance","${summary.closingBalance.toFixed(2)}"`);
  lines.push('');

  // Transactions Header
  lines.push(
    `"Date","Transaction ID","Type","Description","Counterparty","Debit (${account.currency})","Credit (${account.currency})","Running Balance (${account.currency})","Status"`
  );

  const transactions = allPeriodTransactions || statementData.transactions || [];

  for (const tx of transactions) {
    const dateStr = tx.date instanceof Date ? tx.date.toISOString() : tx.date;
    const txId = (tx.transactionId || '').replace(/"/g, '""');
    const type = (tx.type || '').replace(/"/g, '""');
    const desc = (tx.description || '').replace(/"/g, '""');
    const counterparty = (tx.counterparty?.name || '').replace(/"/g, '""');
    const debitStr = tx.debit > 0 ? tx.debit.toFixed(2) : '0.00';
    const creditStr = tx.credit > 0 ? tx.credit.toFixed(2) : '0.00';
    const balanceStr =
      typeof tx.runningBalance === 'number'
        ? tx.runningBalance.toFixed(2)
        : '0.00';
    const status = (tx.status || 'COMPLETED').replace(/"/g, '""');

    lines.push(
      `"${dateStr}","${txId}","${type}","${desc}","${counterparty}","${debitStr}","${creditStr}","${balanceStr}","${status}"`
    );
  }

  return lines.join('\r\n');
}

/**
 * Generate a PDF stream from statement data.
 *
 * @param {Object} statementData
 * @param {import('stream').Writable} outputStream - Writable HTTP response stream
 */
function streamStatementPdf(statementData, outputStream) {
  const { account, statementPeriod, summary, allPeriodTransactions, generatedAt } =
    statementData;

  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: {
      Title: `Account Statement - ${account._id}`,
      Author: 'Banking Transaction System',
    },
  });

  doc.pipe(outputStream);

  // 1. Header & Branding Banner
  doc.rect(40, 40, 515, 60).fill('#1e293b');
  doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold');
  doc.text('BANKING TRANSACTION SYSTEM', 55, 52);
  doc.fontSize(10).font('Helvetica');
  doc.text('Official Account Statement | Double-Entry Verified Ledger', 55, 75);

  doc.fillColor('#334155').fontSize(8).font('Helvetica');
  doc.text(`Generated: ${new Date(generatedAt).toLocaleString()}`, 380, 55, {
    align: 'right',
    width: 160,
  });

  doc.moveDown(3);

  // 2. Account Details & Statement Period Grid
  let y = 115;
  doc.rect(40, y, 515, 65).fill('#f8fafc').stroke('#e2e8f0');

  doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold');
  doc.text('ACCOUNT DETAILS', 50, y + 8);
  doc.font('Helvetica').fontSize(8).fillColor('#334155');
  doc.text(`Holder Name: ${account.accountHolderName || 'N/A'}`, 50, y + 22);
  doc.text(`Account ID: ${account._id}`, 50, y + 34);
  doc.text(`Account Type: ${account.accountType} (${account.currency})`, 50, y + 46);

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a');
  doc.text('STATEMENT PERIOD', 320, y + 8);
  doc.font('Helvetica').fontSize(8).fillColor('#334155');
  const periodText =
    statementPeriod.startDate || statementPeriod.endDate
      ? `${statementPeriod.startDate ? statementPeriod.startDate.substring(0, 10) : 'Start'} to ${
          statementPeriod.endDate ? statementPeriod.endDate.substring(0, 10) : 'Current'
        }`
      : 'All Historical Records';
  doc.text(`Range: ${periodText}`, 320, y + 22);
  doc.text(`Status: ${account.status}`, 320, y + 34);
  doc.text(`Total Transactions: ${summary.transactionCount}`, 320, y + 46);

  // 3. Financial Summary Box
  y = 190;
  doc.rect(40, y, 515, 45).fill('#f1f5f9').stroke('#cbd5e1');

  const colWidth = 515 / 4;
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569');
  doc.text('OPENING BALANCE', 40 + colWidth * 0 + 10, y + 8);
  doc.text('TOTAL CREDITS', 40 + colWidth * 1 + 10, y + 8);
  doc.text('TOTAL DEBITS', 40 + colWidth * 2 + 10, y + 8);
  doc.text('CLOSING BALANCE', 40 + colWidth * 3 + 10, y + 8);

  doc.fontSize(11).font('Helvetica-Bold');
  doc.fillColor('#0f172a').text(
    `${account.currency} ${summary.openingBalance.toFixed(2)}`,
    40 + colWidth * 0 + 10,
    y + 24
  );
  doc.fillColor('#16a34a').text(
    `+${account.currency} ${summary.totalCredits.toFixed(2)}`,
    40 + colWidth * 1 + 10,
    y + 24
  );
  doc.fillColor('#dc2626').text(
    `-${account.currency} ${summary.totalDebits.toFixed(2)}`,
    40 + colWidth * 2 + 10,
    y + 24
  );
  doc.fillColor('#0284c7').text(
    `${account.currency} ${summary.closingBalance.toFixed(2)}`,
    40 + colWidth * 3 + 10,
    y + 24
  );

  // 4. Transactions Table Header
  y = 250;
  doc.rect(40, y, 515, 20).fill('#334155');
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff');
  doc.text('DATE', 45, y + 6, { width: 65 });
  doc.text('TYPE / REF', 115, y + 6, { width: 90 });
  doc.text('DESCRIPTION', 210, y + 6, { width: 130 });
  doc.text('DEBIT', 345, y + 6, { width: 55, align: 'right' });
  doc.text('CREDIT', 405, y + 6, { width: 55, align: 'right' });
  doc.text('BALANCE', 465, y + 6, { width: 80, align: 'right' });

  y += 20;

  // 5. Table Rows
  const transactions =
    allPeriodTransactions || statementData.transactions || [];

  if (transactions.length === 0) {
    doc.rect(40, y, 515, 30).fill('#ffffff').stroke('#e2e8f0');
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#64748b');
    doc.text('No transactions recorded during this statement period.', 50, y + 10);
    y += 30;
  } else {
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];

      // Page break check
      if (y > 750) {
        doc.addPage();
        y = 40;
        // Re-render table header on new page
        doc.rect(40, y, 515, 20).fill('#334155');
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff');
        doc.text('DATE', 45, y + 6, { width: 65 });
        doc.text('TYPE / REF', 115, y + 6, { width: 90 });
        doc.text('DESCRIPTION', 210, y + 6, { width: 130 });
        doc.text('DEBIT', 345, y + 6, { width: 55, align: 'right' });
        doc.text('CREDIT', 405, y + 6, { width: 55, align: 'right' });
        doc.text('BALANCE', 465, y + 6, { width: 80, align: 'right' });
        y += 20;
      }

      const isEven = i % 2 === 0;
      doc.rect(40, y, 515, 24).fill(isEven ? '#f8fafc' : '#ffffff').stroke('#f1f5f9');

      const dateStr =
        tx.date instanceof Date
          ? tx.date.toISOString().substring(0, 10)
          : String(tx.date).substring(0, 10);

      doc.font('Helvetica').fontSize(7).fillColor('#334155');
      doc.text(dateStr, 45, y + 7, { width: 65 });

      doc.font('Helvetica-Bold').fontSize(7).fillColor('#0f172a');
      const refSnippet = tx.transactionId ? tx.transactionId.substring(0, 8) + '...' : '';
      doc.text(`${tx.type}\n${refSnippet}`, 115, y + 4, { width: 90 });

      doc.font('Helvetica').fontSize(6.5).fillColor('#475569');
      const descSnippet = (tx.description || '').substring(0, 35);
      doc.text(descSnippet, 210, y + 7, { width: 130 });

      // Debit
      if (tx.debit > 0) {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#dc2626');
        doc.text(`-${tx.debit.toFixed(2)}`, 345, y + 7, {
          width: 55,
          align: 'right',
        });
      } else {
        doc.font('Helvetica').fontSize(7).fillColor('#94a3b8');
        doc.text('-', 345, y + 7, { width: 55, align: 'right' });
      }

      // Credit
      if (tx.credit > 0) {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#16a34a');
        doc.text(`+${tx.credit.toFixed(2)}`, 405, y + 7, {
          width: 55,
          align: 'right',
        });
      } else {
        doc.font('Helvetica').fontSize(7).fillColor('#94a3b8');
        doc.text('-', 405, y + 7, { width: 55, align: 'right' });
      }

      // Running Balance
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0284c7');
      doc.text(`${Number(tx.runningBalance || 0).toFixed(2)}`, 465, y + 7, {
        width: 80,
        align: 'right',
      });

      y += 24;
    }
  }

  // Footer on bottom of page
  doc.fontSize(7).font('Helvetica-Oblique').fillColor('#94a3b8');
  doc.text(
    'This is a computer-generated bank statement derived directly from the immutable double-entry ledger. No signature required.',
    40,
    780,
    { align: 'center', width: 515 }
  );

  doc.end();
}

module.exports = {
  generateAccountStatement,
  generateStatementCsv,
  streamStatementPdf,
};

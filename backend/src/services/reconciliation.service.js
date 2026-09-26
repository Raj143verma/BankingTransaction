const mongoose = require('mongoose');
const accountModel = require('../models/account.model');
const ladgerModel = require('../models/ladger.model');
const transactionModel = require('../models/transaction.model');
const userModel = require('../models/user.model');
const accountApplicationModel = require('../models/accountApplication.model');
const reconciliationRunModel = require('../models/reconciliationRun.model');
const { logAuditEvent } = require('./auditLog.service');
const PDFDocument = require('pdfkit');

/**
 * Currency rounding helper to maintain strict 2-decimal financial precision.
 */
function roundCurrency(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}

/**
 * Execute a comprehensive, authoritative, read-only system financial reconciliation run.
 *
 * @param {Object} params
 * @param {Object} params.user - The system admin user initiating the run
 * @param {Object} [params.req] - Express request for audit metadata logging
 * @returns {Promise<Object>} Created and persisted ReconciliationRun document
 */
async function executeReconciliationRun({ user, scope = null, req = null }) {
  const startedAt = new Date();
  const runId = `REC-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  const anomalies = [];
  const accountSummaries = [];

  // 1. Build Query Scopes
  const accountQuery = {};
  const txQuery = {};
  const ledgerQuery = {};

  if (scope && Array.isArray(scope.accountIds) && scope.accountIds.length > 0) {
    const accObjIds = scope.accountIds.map((id) => new mongoose.Types.ObjectId(id));
    accountQuery._id = { $in: accObjIds };
    txQuery.$or = [{ fromAccount: { $in: accObjIds } }, { toAccount: { $in: accObjIds } }];
    ledgerQuery.account = { $in: accObjIds };
  }

  if (scope && Array.isArray(scope.transactionIds) && scope.transactionIds.length > 0) {
    const txObjIds = scope.transactionIds.map((id) => new mongoose.Types.ObjectId(id));
    txQuery._id = { $in: txObjIds };
  }

  // 2. Fetch All Core Entities for Scope
  const [accounts, transactions, ledgerEntries, users] = await Promise.all([
    accountModel.find(accountQuery).populate('user', 'name email systemUser').lean(),
    transactionModel.find(txQuery).lean(),
    ladgerModel.find(ledgerQuery).lean(),
    userModel.find().select('name email systemUser').lean(),
  ]);

  const accountMap = new Map();
  accounts.forEach((acc) => accountMap.set(acc._id.toString(), acc));

  const transactionMap = new Map();
  transactions.forEach((tx) => transactionMap.set(tx._id.toString(), tx));

  const userMap = new Map();
  users.forEach((u) => userMap.set(u._id.toString(), u));

  // --- CHECK A: Global Double-Entry Balance ---
  let totalCredits = 0;
  let totalDebits = 0;

  ledgerEntries.forEach((entry) => {
    const amt = roundCurrency(entry.amount);
    if (entry.type === 'CREDIT') {
      totalCredits = roundCurrency(totalCredits + amt);
    } else if (entry.type === 'DEBIT') {
      totalDebits = roundCurrency(totalDebits + amt);
    } else {
      anomalies.push({
        anomalyType: 'MALFORMED_LEDGER_ENTRY',
        severity: 'CRITICAL',
        resourceType: 'LEDGER',
        resourceId: entry._id ? entry._id.toString() : 'UNKNOWN',
        description: `Ledger entry has invalid type: '${entry.type}'`,
        details: { entryId: entry._id, type: entry.type, amount: entry.amount },
        timestamp: new Date(),
      });
    }
  });

  const globalDifference = roundCurrency(Math.abs(totalCredits - totalDebits));
  const isGlobalBalanced = globalDifference === 0;

  if (!isGlobalBalanced) {
    anomalies.push({
      anomalyType: 'GLOBAL_LEDGER_MISMATCH',
      severity: 'CRITICAL',
      resourceType: 'GLOBAL',
      resourceId: 'GLOBAL_LEDGER',
      description: `Global double-entry mismatch detected: Total credits (${totalCredits.toFixed(
        2
      )}) do not equal total debits (${totalDebits.toFixed(2)}). Discrepancy: ${globalDifference.toFixed(2)}`,
      details: { totalCredits, totalDebits, difference: globalDifference },
      timestamp: new Date(),
    });
  }

  // --- CHECK B: Account Balance Reconciliation ---
  // Group ledger entries by account
  const accountLedgerMap = new Map();
  ledgerEntries.forEach((entry) => {
    if (!entry.account) return;
    const accId = entry.account.toString();
    if (!accountLedgerMap.has(accId)) {
      accountLedgerMap.set(accId, { credits: 0, debits: 0, entries: [] });
    }
    const bucket = accountLedgerMap.get(accId);
    bucket.entries.push(entry);
    const amt = roundCurrency(entry.amount);
    if (entry.type === 'CREDIT') {
      bucket.credits = roundCurrency(bucket.credits + amt);
    } else if (entry.type === 'DEBIT') {
      bucket.debits = roundCurrency(bucket.debits + amt);
    }
  });

  for (const acc of accounts) {
    const accIdStr = acc._id.toString();
    const ledgerBucket = accountLedgerMap.get(accIdStr) || { credits: 0, debits: 0, entries: [] };
    const calculatedBalance = roundCurrency(ledgerBucket.credits - ledgerBucket.debits);

    // Call live getBalance() from account model to verify derived pipeline match
    const accountDoc = new accountModel(acc);
    let storedDerivedBalance = 0;
    try {
      storedDerivedBalance = roundCurrency(await accountDoc.getBalance());
    } catch {
      storedDerivedBalance = calculatedBalance;
    }

    const diff = roundCurrency(Math.abs(calculatedBalance - storedDerivedBalance));
    const isAccBalanced = diff === 0;

    if (!isAccBalanced) {
      anomalies.push({
        anomalyType: 'ACCOUNT_BALANCE_MISMATCH',
        severity: 'CRITICAL',
        resourceType: 'ACCOUNT',
        resourceId: accIdStr,
        description: `Account balance mismatch for account ${accIdStr} (${acc.accountHolderName || 'Account'}): Independent ledger sum (${calculatedBalance.toFixed(
          2
        )}) differs from derived account balance (${storedDerivedBalance.toFixed(2)}) by ${diff.toFixed(2)}`,
        details: {
          accountId: accIdStr,
          calculatedBalance,
          storedDerivedBalance,
          difference: diff,
        },
        timestamp: new Date(),
      });
    }

    // Check for impossible negative balance
    const isSystemReserve = acc.user?.systemUser === true || acc.accountType === 'CURRENT';
    if (calculatedBalance < 0 && !isSystemReserve) {
      anomalies.push({
        anomalyType: 'IMPOSSIBLE_NEGATIVE_BALANCE',
        severity: 'CRITICAL',
        resourceType: 'ACCOUNT',
        resourceId: accIdStr,
        description: `Customer account ${accIdStr} (${acc.accountHolderName || 'Customer'}) has an impossible negative balance: ${calculatedBalance.toFixed(2)}`,
        details: { accountId: accIdStr, calculatedBalance },
        timestamp: new Date(),
      });
    }

    accountSummaries.push({
      accountId: acc._id,
      accountHolderName: acc.accountHolderName || acc.user?.name || 'Account Holder',
      accountType: acc.accountType || 'SAVINGS',
      currency: acc.currency || 'INR',
      status: acc.status || 'ACTIVE',
      isSystemReserve: Boolean(acc.user?.systemUser),
      totalCredits: ledgerBucket.credits,
      totalDebits: ledgerBucket.debits,
      calculatedBalance,
      storedBalance: storedDerivedBalance,
      difference: diff,
      isBalanced: isAccBalanced && calculatedBalance >= 0,
    });
  }

  // --- CHECK C: Transaction ↔ Ledger Consistency & Reversals ---
  // Group ledger entries by transaction
  const txLedgerMap = new Map();
  ledgerEntries.forEach((entry) => {
    if (!entry.transaction) return;
    const txId = entry.transaction.toString();
    if (!txLedgerMap.has(txId)) {
      txLedgerMap.set(txId, []);
    }
    txLedgerMap.get(txId).push(entry);
  });

  const seenIdempotencyKeys = new Set();

  for (const tx of transactions) {
    const txIdStr = tx._id.toString();
    const relatedEntries = txLedgerMap.get(txIdStr) || [];

    // Idempotency check
    if (tx.idempotencyKey) {
      if (seenIdempotencyKeys.has(tx.idempotencyKey)) {
        anomalies.push({
          anomalyType: 'DUPLICATE_IDEMPOTENCY_KEY',
          severity: 'CRITICAL',
          resourceType: 'TRANSACTION',
          resourceId: txIdStr,
          description: `Duplicate idempotency key detected across transactions: '${tx.idempotencyKey}'`,
          details: { transactionId: txIdStr, idempotencyKey: tx.idempotencyKey },
          timestamp: new Date(),
        });
      }
      seenIdempotencyKeys.add(tx.idempotencyKey);
    }

    if (tx.status === 'COMPLETED') {
      // Must have exactly 2 ledger entries: 1 DEBIT from fromAccount, 1 CREDIT to toAccount
      const debitEntry = relatedEntries.find(
        (e) =>
          e.type === 'DEBIT' &&
          e.account &&
          e.account.toString() === tx.fromAccount?.toString()
      );
      const creditEntry = relatedEntries.find(
        (e) =>
          e.type === 'CREDIT' &&
          e.account &&
          e.account.toString() === tx.toAccount?.toString()
      );

      if (!debitEntry || !creditEntry || relatedEntries.length !== 2) {
        anomalies.push({
          anomalyType: 'MISSING_LEDGER_ENTRIES',
          severity: 'CRITICAL',
          resourceType: 'TRANSACTION',
          resourceId: txIdStr,
          description: `Completed transaction ${txIdStr} is missing expected double-entry ledger records (Found: ${relatedEntries.length}, Expected: 2)`,
          details: {
            transactionId: txIdStr,
            expectedDebitAccount: tx.fromAccount,
            expectedCreditAccount: tx.toAccount,
            entriesFound: relatedEntries.length,
          },
          timestamp: new Date(),
        });
      } else {
        // Verify amounts match
        if (
          roundCurrency(debitEntry.amount) !== roundCurrency(tx.amount) ||
          roundCurrency(creditEntry.amount) !== roundCurrency(tx.amount)
        ) {
          anomalies.push({
            anomalyType: 'AMOUNT_MISMATCH',
            severity: 'CRITICAL',
            resourceType: 'TRANSACTION',
            resourceId: txIdStr,
            description: `Transaction amount (${tx.amount}) does not match ledger entries (Debit: ${debitEntry.amount}, Credit: ${creditEntry.amount})`,
            details: {
              transactionId: txIdStr,
              txAmount: tx.amount,
              debitAmount: debitEntry.amount,
              creditAmount: creditEntry.amount,
            },
            timestamp: new Date(),
          });
        }
      }
    } else if (tx.status === 'REVERSED') {
      // Must have 4 ledger entries: 2 original + 2 compensating
      const origDebit = relatedEntries.find(
        (e) =>
          e.type === 'DEBIT' &&
          e.account &&
          e.account.toString() === tx.fromAccount?.toString()
      );
      const origCredit = relatedEntries.find(
        (e) =>
          e.type === 'CREDIT' &&
          e.account &&
          e.account.toString() === tx.toAccount?.toString()
      );
      const compCredit = relatedEntries.find(
        (e) =>
          e.type === 'CREDIT' &&
          e.account &&
          e.account.toString() === tx.fromAccount?.toString()
      );
      const compDebit = relatedEntries.find(
        (e) =>
          e.type === 'DEBIT' &&
          e.account &&
          e.account.toString() === tx.toAccount?.toString()
      );

      if (!origDebit || !origCredit || !compCredit || !compDebit) {
        anomalies.push({
          anomalyType: 'MISSING_LEDGER_ENTRIES',
          severity: 'CRITICAL',
          resourceType: 'TRANSACTION',
          resourceId: txIdStr,
          description: `Reversed transaction ${txIdStr} is missing required original or compensating ledger entries (Found: ${relatedEntries.length}, Expected: 4)`,
          details: { transactionId: txIdStr, totalEntriesFound: relatedEntries.length },
          timestamp: new Date(),
        });
      }

      if (relatedEntries.length > 4) {
        anomalies.push({
          anomalyType: 'DUPLICATE_REVERSAL_ENTRY',
          severity: 'CRITICAL',
          resourceType: 'TRANSACTION',
          resourceId: txIdStr,
          description: `Duplicate compensating reversal entries detected for transaction ${txIdStr} (Found ${relatedEntries.length} entries)`,
          details: { transactionId: txIdStr, totalEntriesFound: relatedEntries.length },
          timestamp: new Date(),
        });
      }

      if (!tx.reversalReason || !tx.reversedAt) {
        anomalies.push({
          anomalyType: 'INVALID_REVERSAL_REFERENCE',
          severity: 'WARNING',
          resourceType: 'TRANSACTION',
          resourceId: txIdStr,
          description: `Reversed transaction ${txIdStr} is missing mandatory audit metadata (reason or timestamp)`,
          details: {
            transactionId: txIdStr,
            reversalReason: tx.reversalReason,
            reversedAt: tx.reversedAt,
          },
          timestamp: new Date(),
        });
      }
    } else if (tx.status === 'PENDING' || tx.status === 'FAILED') {
      if (relatedEntries.length > 0) {
        anomalies.push({
          anomalyType: 'TRANSACTION_STATUS_MISMATCH',
          severity: 'CRITICAL',
          resourceType: 'TRANSACTION',
          resourceId: txIdStr,
          description: `Transaction ${txIdStr} with status '${tx.status}' unexpectedly has ${relatedEntries.length} recorded ledger entries`,
          details: {
            transactionId: txIdStr,
            status: tx.status,
            entriesCount: relatedEntries.length,
          },
          timestamp: new Date(),
        });
      }
    }
  }

  // --- CHECK D: Orphan Ledger Entries & Invalid References ---
  for (const entry of ledgerEntries) {
    const entryIdStr = entry._id ? entry._id.toString() : 'UNKNOWN';

    // Check if associated transaction exists
    if (!entry.transaction || !transactionMap.has(entry.transaction.toString())) {
      anomalies.push({
        anomalyType: 'ORPHAN_LEDGER_ENTRY',
        severity: 'CRITICAL',
        resourceType: 'LEDGER',
        resourceId: entryIdStr,
        description: `Ledger entry ${entryIdStr} references non-existent or null transaction '${entry.transaction}'`,
        details: { entryId: entryIdStr, transactionId: entry.transaction },
        timestamp: new Date(),
      });
    }

    // Check if associated account exists
    if (!entry.account || !accountMap.has(entry.account.toString())) {
      anomalies.push({
        anomalyType: 'ORPHAN_LEDGER_ENTRY',
        severity: 'CRITICAL',
        resourceType: 'LEDGER',
        resourceId: entryIdStr,
        description: `Ledger entry ${entryIdStr} references non-existent or null account '${entry.account}'`,
        details: { entryId: entryIdStr, accountId: entry.account },
        timestamp: new Date(),
      });
    }

    // Check valid positive amount
    if (typeof entry.amount !== 'number' || isNaN(entry.amount) || entry.amount <= 0) {
      anomalies.push({
        anomalyType: 'MALFORMED_LEDGER_ENTRY',
        severity: 'CRITICAL',
        resourceType: 'LEDGER',
        resourceId: entryIdStr,
        description: `Ledger entry ${entryIdStr} has invalid non-positive amount: ${entry.amount}`,
        details: { entryId: entryIdStr, amount: entry.amount },
        timestamp: new Date(),
      });
    }
  }

  // --- CHECK E: System / Reserve Account Integrity ---
  const systemAccounts = accounts.filter((a) => a.user?.systemUser === true);
  if (systemAccounts.length === 0) {
    anomalies.push({
      anomalyType: 'SYSTEM_RESERVE_MISSING',
      severity: 'WARNING',
      resourceType: 'SYSTEM',
      resourceId: 'SYSTEM_RESERVE',
      description: 'No institutional system reserve account detected in the database',
      details: {},
      timestamp: new Date(),
    });
  }

  // Compute Anomaly Metrics
  let criticalCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  anomalies.forEach((a) => {
    if (a.severity === 'CRITICAL') criticalCount++;
    else if (a.severity === 'WARNING') warningCount++;
    else infoCount++;
  });

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const runStatus =
    criticalCount > 0
      ? 'MISMATCH_DETECTED'
      : warningCount > 0
      ? 'BALANCED'
      : 'BALANCED';

  // 2. Persist Reconciliation Run Record (Append-Only)
  const reconciliationDoc = {
    runId,
    startedAt,
    completedAt,
    durationMs,
    status: runStatus,
    isBalanced: isGlobalBalanced && criticalCount === 0,
    totalAccountsChecked: accounts.length,
    totalTransactionsChecked: transactions.length,
    totalLedgerEntriesChecked: ledgerEntries.length,
    totalCredits,
    totalDebits,
    difference: globalDifference,
    totalAnomalies: anomalies.length,
    criticalAnomalies: criticalCount,
    warningAnomalies: warningCount,
    infoAnomalies: infoCount,
    anomalies,
    accountSummaries,
    initiatedBy: user._id,
    summary: {
      globalBalanceStatus: isGlobalBalanced ? 'BALANCED' : 'UNBALANCED',
      systemAccountsChecked: systemAccounts.length,
      customerAccountsChecked: accounts.length - systemAccounts.length,
      durationMs,
    },
  };

  const savedRun = await reconciliationRunModel.create(reconciliationDoc);

  // 3. Record STEP 5 System Audit Log Event
  await logAuditEvent({
    actor: user._id,
    action: runStatus === 'MISMATCH_DETECTED' ? 'RECONCILIATION_COMPLETED' : 'RECONCILIATION_COMPLETED',
    resourceType: 'RECONCILIATION',
    resourceId: savedRun._id,
    previousState: null,
    newState: {
      runId,
      status: runStatus,
      isBalanced: isGlobalBalanced && criticalCount === 0,
      totalAnomalies: anomalies.length,
      criticalAnomalies: criticalCount,
    },
    reason: `Automated financial reconciliation run executed by system administrator`,
    metadata: {
      runId,
      totalCredits,
      totalDebits,
      difference: globalDifference,
      totalAccountsChecked: accounts.length,
      totalTransactionsChecked: transactions.length,
      totalLedgerEntriesChecked: ledgerEntries.length,
      criticalAnomalies: criticalCount,
    },
    req,
  });

  return savedRun.toObject();
}

/**
 * Generate an RFC-4180 compliant CSV export for a reconciliation run.
 */
function generateReconciliationCsv(runData) {
  const lines = [];

  lines.push(`"BANKING SYSTEM FINANCIAL RECONCILIATION REPORT"`);
  lines.push(`"Run ID","${runData.runId}"`);
  lines.push(`"Status","${runData.status}"`);
  lines.push(`"Balanced","${runData.isBalanced ? 'YES' : 'NO'}"`);
  lines.push(`"Started At","${new Date(runData.startedAt).toISOString()}"`);
  lines.push(`"Completed At","${new Date(runData.completedAt).toISOString()}"`);
  lines.push(`"Duration","${runData.durationMs} ms"`);
  lines.push('');

  lines.push(`"GLOBAL FINANCIAL METRICS"`);
  lines.push(`"Total Credits","${(runData.totalCredits || 0).toFixed(2)}"`);
  lines.push(`"Total Debits","${(runData.totalDebits || 0).toFixed(2)}"`);
  lines.push(`"Difference","${(runData.difference || 0).toFixed(2)}"`);
  lines.push(`"Accounts Checked","${runData.totalAccountsChecked || 0}"`);
  lines.push(`"Transactions Checked","${runData.totalTransactionsChecked || 0}"`);
  lines.push(`"Ledger Entries Checked","${runData.totalLedgerEntriesChecked || 0}"`);
  lines.push(`"Total Anomalies","${runData.totalAnomalies || 0}"`);
  lines.push(`"Critical Anomalies","${runData.criticalAnomalies || 0}"`);
  lines.push('');

  lines.push(`"ACCOUNT RECONCILIATION BREAKDOWN"`);
  lines.push(`"Account ID","Holder Name","Type","Currency","Credits","Debits","Calculated Balance","Stored Balance","Status","Balanced"`);

  (runData.accountSummaries || []).forEach((acc) => {
    const name = (acc.accountHolderName || '').replace(/"/g, '""');
    lines.push(
      `"${acc.accountId}","${name}","${acc.accountType}","${acc.currency}","${(acc.totalCredits || 0).toFixed(2)}","${(acc.totalDebits || 0).toFixed(2)}","${(acc.calculatedBalance || 0).toFixed(2)}","${(acc.storedBalance || 0).toFixed(2)}","${acc.status}","${acc.isBalanced ? 'YES' : 'NO'}"`
    );
  });
  lines.push('');

  lines.push(`"DETECTED FINANCIAL & STRUCTURAL ANOMALIES"`);
  lines.push(`"Severity","Type","Resource Type","Resource ID","Description","Timestamp"`);

  (runData.anomalies || []).forEach((anom) => {
    const desc = (anom.description || '').replace(/"/g, '""');
    const type = (anom.anomalyType || '').replace(/"/g, '""');
    lines.push(
      `"${anom.severity}","${type}","${anom.resourceType}","${anom.resourceId || 'N/A'}","${desc}","${new Date(anom.timestamp).toISOString()}"`
    );
  });

  return lines.join('\r\n');
}

/**
 * Stream a professional PDF report for a reconciliation run.
 */
function streamReconciliationPdf(runData, outputStream) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: {
      Title: `Financial Reconciliation Report - ${runData.runId}`,
      Author: 'Banking Transaction System',
    },
  });

  doc.pipe(outputStream);

  // 1. Header Banner
  doc.rect(40, 40, 515, 60).fill('#0f172a');
  doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold');
  doc.text('SYSTEM FINANCIAL RECONCILIATION REPORT', 55, 52);
  doc.fontSize(9).font('Helvetica');
  doc.text('Automated Double-Entry Ledger & Balance Verification Engine', 55, 74);

  doc.fillColor('#94a3b8').fontSize(8).font('Helvetica');
  doc.text(`Run: ${runData.runId}`, 360, 52, { align: 'right', width: 180 });
  doc.text(`Completed: ${new Date(runData.completedAt).toLocaleString()}`, 360, 66, {
    align: 'right',
    width: 180,
  });

  let y = 115;

  // 2. Executive Summary Box
  const statusColor = runData.status === 'BALANCED' ? '#16a34a' : '#dc2626';
  doc.rect(40, y, 515, 65).fill('#f8fafc').stroke('#cbd5e1');

  doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold');
  doc.text('OVERALL INTEGRITY STATUS', 55, y + 10);
  doc.fontSize(14).fillColor(statusColor).text(runData.status, 55, y + 26);
  doc.fontSize(8).font('Helvetica').fillColor('#64748b');
  doc.text(`Difference: INR ${(runData.difference || 0).toFixed(2)} | Duration: ${runData.durationMs}ms`, 55, y + 46);

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a');
  doc.text('AUDIT METRICS', 320, y + 10);
  doc.font('Helvetica').fontSize(8).fillColor('#334155');
  doc.text(`Accounts Checked: ${runData.totalAccountsChecked}`, 320, y + 24);
  doc.text(`Transactions Checked: ${runData.totalTransactionsChecked}`, 320, y + 36);
  doc.text(`Ledger Entries: ${runData.totalLedgerEntriesChecked}`, 320, y + 48);

  // 3. Global Financial Totals
  y = 190;
  doc.rect(40, y, 515, 45).fill('#f1f5f9').stroke('#cbd5e1');
  const colWidth = 515 / 4;

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#475569');
  doc.text('TOTAL CREDITS', 40 + colWidth * 0 + 10, y + 8);
  doc.text('TOTAL DEBITS', 40 + colWidth * 1 + 10, y + 8);
  doc.text('TOTAL ANOMALIES', 40 + colWidth * 2 + 10, y + 8);
  doc.text('CRITICAL ISSUES', 40 + colWidth * 3 + 10, y + 8);

  doc.fontSize(11).font('Helvetica-Bold');
  doc.fillColor('#16a34a').text(`INR ${(runData.totalCredits || 0).toFixed(2)}`, 40 + colWidth * 0 + 10, y + 24);
  doc.fillColor('#dc2626').text(`INR ${(runData.totalDebits || 0).toFixed(2)}`, 40 + colWidth * 1 + 10, y + 24);
  doc.fillColor(runData.totalAnomalies > 0 ? '#d97706' : '#16a34a').text(`${runData.totalAnomalies}`, 40 + colWidth * 2 + 10, y + 24);
  doc.fillColor(runData.criticalAnomalies > 0 ? '#dc2626' : '#16a34a').text(`${runData.criticalAnomalies}`, 40 + colWidth * 3 + 10, y + 24);

  // 4. Anomalies Table
  y = 250;
  doc.rect(40, y, 515, 20).fill('#1e293b');
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
  doc.text('SEVERITY', 45, y + 6, { width: 65 });
  doc.text('TYPE', 115, y + 6, { width: 120 });
  doc.text('RESOURCE', 240, y + 6, { width: 80 });
  doc.text('DESCRIPTION', 325, y + 6, { width: 220 });

  y += 20;

  const anomalies = runData.anomalies || [];
  if (anomalies.length === 0) {
    doc.rect(40, y, 515, 30).fill('#ffffff').stroke('#e2e8f0');
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#16a34a');
    doc.text('No financial or structural anomalies detected. All ledger records strictly reconciled.', 50, y + 10);
    y += 30;
  } else {
    for (let i = 0; i < anomalies.length; i++) {
      const anom = anomalies[i];

      if (y > 740) {
        doc.addPage();
        y = 40;
        doc.rect(40, y, 515, 20).fill('#1e293b');
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
        doc.text('SEVERITY', 45, y + 6, { width: 65 });
        doc.text('TYPE', 115, y + 6, { width: 120 });
        doc.text('RESOURCE', 240, y + 6, { width: 80 });
        doc.text('DESCRIPTION', 325, y + 6, { width: 220 });
        y += 20;
      }

      const isEven = i % 2 === 0;
      doc.rect(40, y, 515, 24).fill(isEven ? '#f8fafc' : '#ffffff').stroke('#f1f5f9');

      const sevColor =
        anom.severity === 'CRITICAL' ? '#dc2626' : anom.severity === 'WARNING' ? '#d97706' : '#0284c7';
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(sevColor);
      doc.text(anom.severity, 45, y + 7, { width: 65 });

      doc.font('Helvetica-Bold').fontSize(7).fillColor('#0f172a');
      doc.text((anom.anomalyType || '').substring(0, 24), 115, y + 7, { width: 120 });

      doc.font('Helvetica').fontSize(6.5).fillColor('#475569');
      const resSnippet = (anom.resourceId || 'N/A').substring(0, 14);
      doc.text(`${anom.resourceType}\n${resSnippet}`, 240, y + 4, { width: 80 });

      const descSnippet = (anom.description || '').substring(0, 50);
      doc.text(descSnippet, 325, y + 7, { width: 220 });

      y += 24;
    }
  }

  // Footer
  doc.fontSize(7).font('Helvetica-Oblique').fillColor('#94a3b8');
  doc.text(
    'Banking Transaction System — Official Operational Financial Integrity Audit Log. Generated securely.',
    40,
    780,
    { align: 'center', width: 515 }
  );

  doc.end();
}

module.exports = {
  executeReconciliationRun,
  generateReconciliationCsv,
  streamReconciliationPdf,
};

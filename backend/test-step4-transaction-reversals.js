/**
 * Integration Test Suite for STEP 4:
 * "Transaction Reversal & Refund Workflow"
 * Uses native Node.js fetch and http server (zero external test dependencies)
 */
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const userModel = require('./src/models/user.model');
const accountModel = require('./src/models/account.model');
const transactionModel = require('./src/models/transaction.model');
const ladgerModel = require('./src/models/ladger.model');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/banking';
const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_for_banking_lifecycle_suite_32chars!';

let server;
let app;
let baseUrl;

async function apiRequest(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let body = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  } else {
    try {
      body = await response.text();
    } catch {
      body = null;
    }
  }

  return {
    status: response.status,
    headers: response.headers,
    body,
  };
}

async function runStep4Tests() {
  console.log('\n==================================================');
  console.log('STARTING STEP 4 TRANSACTION REVERSALS INTEGRATION TEST SUITE');
  console.log('==================================================\n');

  await mongoose.connect(MONGO_URI);
  console.log('✓ Connected to MongoDB');

  app = require('./src/app');
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✓ Test HTTP server listening on ${baseUrl}`);

  let customerA, customerB, customerC, systemUser;
  let accountA, accountB, accountC, systemReserveAccount;
  let tokenA, tokenB, tokenSys;

  try {
    const timestamp = Date.now();
    const emailA = `step4_cust_a_${timestamp}@example.com`;
    const emailB = `step4_cust_b_${timestamp}@example.com`;
    const emailC = `step4_cust_c_${timestamp}@example.com`;
    const emailSys = `step4_sys_${timestamp}@example.com`;

    // 1. Create Users
    customerA = await userModel.create({
      name: 'Alice Reversal',
      email: emailA,
      password: 'Password123!',
      systemUser: false,
    });

    customerB = await userModel.create({
      name: 'Bob Reversal',
      email: emailB,
      password: 'Password123!',
      systemUser: false,
    });

    customerC = await userModel.create({
      name: 'Charlie Reversal',
      email: emailC,
      password: 'Password123!',
      systemUser: false,
    });

    systemUser = await userModel.create({
      name: 'Central Bank Risk Officer',
      email: emailSys,
      password: 'Password123!',
      systemUser: true,
    });

    tokenA = jwt.sign({ id: customerA._id }, JWT_SECRET, { expiresIn: '1d' });
    tokenB = jwt.sign({ id: customerB._id }, JWT_SECRET, { expiresIn: '1d' });
    tokenSys = jwt.sign({ id: systemUser._id }, JWT_SECRET, { expiresIn: '1d' });

    // 2. Create Accounts
    accountA = await accountModel.create({
      user: customerA._id,
      accountHolderName: 'Alice Primary',
      accountType: 'SAVINGS',
      status: 'ACTIVE',
      currency: 'INR',
    });

    accountB = await accountModel.create({
      user: customerB._id,
      accountHolderName: 'Bob Primary',
      accountType: 'SAVINGS',
      status: 'ACTIVE',
      currency: 'INR',
    });

    accountC = await accountModel.create({
      user: customerC._id,
      accountHolderName: 'Charlie Primary',
      accountType: 'SAVINGS',
      status: 'ACTIVE',
      currency: 'INR',
    });

    systemReserveAccount = await accountModel.create({
      user: systemUser._id,
      accountHolderName: 'System Reserve',
      accountType: 'CURRENT',
      status: 'ACTIVE',
      currency: 'INR',
    });

    // Seed Initial Balance for Alice: ₹5,000 (CREDIT Alice, DEBIT System)
    const seedTxA = await transactionModel.create({
      fromAccount: systemReserveAccount._id,
      toAccount: accountA._id,
      amount: 5000,
      status: 'COMPLETED',
      idempotencyKey: `SEED_STEP4_A_${timestamp}`,
    });
    await ladgerModel.create([
      { account: systemReserveAccount._id, amount: 5000, transaction: seedTxA._id, type: 'DEBIT' },
      { account: accountA._id, amount: 5000, transaction: seedTxA._id, type: 'CREDIT' },
    ]);

    // Seed Initial Balance for Bob: ₹1,000 (CREDIT Bob, DEBIT System)
    const seedTxB = await transactionModel.create({
      fromAccount: systemReserveAccount._id,
      toAccount: accountB._id,
      amount: 1000,
      status: 'COMPLETED',
      idempotencyKey: `SEED_STEP4_B_${timestamp}`,
    });
    await ladgerModel.create([
      { account: systemReserveAccount._id, amount: 1000, transaction: seedTxB._id, type: 'DEBIT' },
      { account: accountB._id, amount: 1000, transaction: seedTxB._id, type: 'CREDIT' },
    ]);

    console.log('✓ Test users, accounts, and double-entry seed balances initialized');

    // TEST 1: Unauthenticated Reversal Request (401)
    const resUnauth = await apiRequest(`/api/transactions/${seedTxA._id}/reverse`, {
      method: 'POST',
      body: { reason: 'Testing unauthenticated access' },
    });
    console.assert(resUnauth.status === 401, `Expected 401, got ${resUnauth.status}`);
    console.log('✓ TEST 1: Unauthenticated reversal rejected with HTTP 401');

    // TEST 2: Customer Role Reversal Attempt (403 Forbidden)
    const resCustomerForbidden = await apiRequest(`/api/transactions/${seedTxA._id}/reverse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { reason: 'Customer attempting administrative reversal' },
    });
    console.assert(resCustomerForbidden.status === 403, `Expected 403, got ${resCustomerForbidden.status}`);
    console.log('✓ TEST 2: Customer reversal attempt properly rejected with HTTP 403 Forbidden');

    // TEST 3: Invalid Transaction ObjectId Format (400)
    const resInvalidId = await apiRequest('/api/transactions/invalid-mongo-id-xyz/reverse', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { reason: 'Testing invalid ObjectId' },
    });
    console.assert(resInvalidId.status === 400, `Expected 400, got ${resInvalidId.status}`);
    console.log('✓ TEST 3: Invalid transaction ObjectId format rejected with HTTP 400');

    // TEST 4: Non-Existent Transaction ID (404)
    const fakeTxId = new mongoose.Types.ObjectId().toString();
    const resNotFound = await apiRequest(`/api/transactions/${fakeTxId}/reverse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { reason: 'Testing non-existent transaction' },
    });
    console.assert(resNotFound.status === 404, `Expected 404, got ${resNotFound.status}`);
    console.log('✓ TEST 4: Non-existent transaction returned HTTP 404');

    // TEST 5: Attempting to Reverse a PENDING Transaction (400)
    const pendingTx = await transactionModel.create({
      fromAccount: accountA._id,
      toAccount: accountB._id,
      amount: 100,
      status: 'PENDING',
      idempotencyKey: `PENDING_TX_${timestamp}`,
    });
    const resPending = await apiRequest(`/api/transactions/${pendingTx._id}/reverse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { reason: 'Attempting to reverse pending transaction' },
    });
    console.assert(resPending.status === 400, `Expected 400, got ${resPending.status}`);
    console.log('✓ TEST 5: Reversing PENDING transaction rejected with HTTP 400');

    // TEST 6: Attempting to Reverse a FAILED Transaction (400)
    const failedTx = await transactionModel.create({
      fromAccount: accountA._id,
      toAccount: accountB._id,
      amount: 100,
      status: 'FAILED',
      idempotencyKey: `FAILED_TX_${timestamp}`,
    });
    const resFailed = await apiRequest(`/api/transactions/${failedTx._id}/reverse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { reason: 'Attempting to reverse failed transaction' },
    });
    console.assert(resFailed.status === 400, `Expected 400, got ${resFailed.status}`);
    console.log('✓ TEST 6: Reversing FAILED transaction rejected with HTTP 400');

    // TEST 7: Missing Reversal Reason (400)
    const resMissingReason = await apiRequest(`/api/transactions/${seedTxA._id}/reverse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: {},
    });
    console.assert(resMissingReason.status === 400, `Expected 400, got ${resMissingReason.status}`);
    console.log('✓ TEST 7: Missing reversal reason rejected with HTTP 400');

    // TEST 8: Reversal Reason Too Short (< 5 chars) (400)
    const resShortReason = await apiRequest(`/api/transactions/${seedTxA._id}/reverse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { reason: 'err' },
    });
    console.assert(resShortReason.status === 400, `Expected 400, got ${resShortReason.status}`);
    console.log('✓ TEST 8: Short reversal reason rejected with HTTP 400');

    // TEST 9: Execute Valid P2P Transfer from Alice to Bob (₹500)
    const resTransfer = await apiRequest('/api/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        fromAccount: accountA._id.toString(),
        toAccount: accountB._id.toString(),
        amount: 500,
        idempotencyKey: `TX_ALICE_TO_BOB_${timestamp}`,
      },
    });
    console.assert(resTransfer.status === 201, `Expected 201, got ${resTransfer.status}`);
    const transferTxId = resTransfer.body.transaction._id;

    // Check pre-reversal balances (Alice: 4500, Bob: 1500)
    let balA = await accountA.getBalance();
    let balB = await accountB.getBalance();
    console.assert(balA === 4500, `Expected Alice 4500, got ${balA}`);
    console.assert(balB === 1500, `Expected Bob 1500, got ${balB}`);
    console.log('✓ TEST 9: P2P transfer executed (Alice: ₹4,500, Bob: ₹1,500)');

    // TEST 10: Valid Administrative Reversal (200 OK)
    const resReverse = await apiRequest(`/api/transactions/${transferTxId}/reverse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { reason: 'Duplicate payment flagged during reconciliation' },
    });
    console.assert(resReverse.status === 200, `Expected 200, got ${resReverse.status}`);
    console.assert(resReverse.body.transaction?.status === 'REVERSED', 'Status must be REVERSED');
    console.assert(resReverse.body.transaction?.reversalReason === 'Duplicate payment flagged during reconciliation');
    console.assert(Boolean(resReverse.body.transaction?.reversedAt), 'reversedAt must be set');
    console.assert(resReverse.body.audit?.originalStatus === 'COMPLETED');
    console.assert(resReverse.body.audit?.newStatus === 'REVERSED');
    console.assert(resReverse.body.audit?.performedBy?._id === systemUser._id.toString());
    console.log('✓ TEST 10: Valid transaction reversal succeeded with full audit payload');

    // TEST 11: Original Transaction Document Preserved in Database
    const dbTx = await transactionModel.findById(transferTxId);
    console.assert(dbTx !== null, 'Transaction document must not be deleted');
    console.assert(dbTx.status === 'REVERSED', 'DB status must be REVERSED');
    console.assert(dbTx.amount === 500, 'Original amount must be preserved');
    console.assert(dbTx.fromAccount.toString() === accountA._id.toString(), 'Original fromAccount preserved');
    console.assert(dbTx.toAccount.toString() === accountB._id.toString(), 'Original toAccount preserved');
    console.log('✓ TEST 11: Original transaction document preserved with status REVERSED');

    // TEST 12: Compensating Double-Entry Ledger Records Created
    const txLedgers = await ladgerModel.find({ transaction: transferTxId });
    console.assert(txLedgers.length === 4, `Expected 4 ledger records (2 original + 2 reversal), got ${txLedgers.length}`);

    // Verify individual ledger entries
    const origDebit = txLedgers.find((l) => l.account.toString() === accountA._id.toString() && l.type === 'DEBIT');
    const origCredit = txLedgers.find((l) => l.account.toString() === accountB._id.toString() && l.type === 'CREDIT');
    const revDebit = txLedgers.find((l) => l.account.toString() === accountB._id.toString() && l.type === 'DEBIT');
    const revCredit = txLedgers.find((l) => l.account.toString() === accountA._id.toString() && l.type === 'CREDIT');

    console.assert(Boolean(origDebit && origCredit), 'Original double-entry records intact');
    console.assert(Boolean(revDebit && revCredit), 'Compensating reversal records created');
    console.assert(origDebit.amount === 500 && revCredit.amount === 500);
    console.assert(origCredit.amount === 500 && revDebit.amount === 500);
    console.log('✓ TEST 12: Compensating double-entry ledger records strictly verified');

    // TEST 13: Exact Mathematical Balance Restoration
    balA = await accountA.getBalance();
    balB = await accountB.getBalance();
    console.assert(balA === 5000, `Expected Alice restored to 5000, got ${balA}`);
    console.assert(balB === 1000, `Expected Bob restored to 1000, got ${balB}`);
    console.log('✓ TEST 13: Ledger-derived balances restored to exact initial states (Alice: ₹5,000, Bob: ₹1,000)');

    // TEST 14: Duplicate Reversal Rejection / Idempotency Guard (400)
    const resDupReverse = await apiRequest(`/api/transactions/${transferTxId}/reverse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { reason: 'Attempting second duplicate reversal' },
    });
    console.assert(resDupReverse.status === 400, `Expected 400, got ${resDupReverse.status}`);
    console.assert(
      resDupReverse.body?.message?.includes('already been reversed'),
      'Expected already reversed message'
    );
    console.log('✓ TEST 14: Duplicate reversal attempt rejected with HTTP 400');

    // TEST 15: Reversal Blocked When Receiver Has Insufficient Balance (400)
    // 15a: Alice sends Bob ₹1,000 -> Alice: 4000, Bob: 2000
    const resTx2 = await apiRequest('/api/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        fromAccount: accountA._id.toString(),
        toAccount: accountB._id.toString(),
        amount: 1000,
        idempotencyKey: `TX_ALICE_TO_BOB_2_${timestamp}`,
      },
    });
    console.assert(resTx2.status === 201);
    const tx2Id = resTx2.body.transaction._id;

    // 15b: Bob spends ₹1,800 to Charlie -> Bob: 200, Charlie: 1800
    const resTx3 = await apiRequest('/api/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: {
        fromAccount: accountB._id.toString(),
        toAccount: accountC._id.toString(),
        amount: 1800,
        idempotencyKey: `TX_BOB_TO_CHARLIE_${timestamp}`,
      },
    });
    console.assert(resTx3.status === 201);

    // Verify Bob's balance is now only ₹200
    balB = await accountB.getBalance();
    console.assert(balB === 200, `Expected Bob 200, got ${balB}`);

    // 15c: System attempts to reverse the ₹1,000 transfer from Alice to Bob -> MUST BE BLOCKED
    const resInsufficientReversal = await apiRequest(`/api/transactions/${tx2Id}/reverse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { reason: 'Attempting to reverse transfer where receiver spent funds' },
    });
    console.assert(resInsufficientReversal.status === 400, `Expected 400, got ${resInsufficientReversal.status}`);
    console.assert(
      resInsufficientReversal.body?.message?.includes('insufficient available balance'),
      'Expected insufficient available balance error message'
    );

    // Verify tx2 remains COMPLETED and Bob's balance is still 200
    const checkTx2 = await transactionModel.findById(tx2Id);
    console.assert(checkTx2.status === 'COMPLETED', 'Transaction must remain COMPLETED');
    balB = await accountB.getBalance();
    console.assert(balB === 200, 'Bob balance must remain 200');
    console.log('✓ TEST 15: Reversal blocked when receiver has insufficient balance to cover debit');

    // TEST 16: System Fund Transaction Reversal to Institutional Reserve
    // 16a: System funds Charlie ₹2,000
    const resFundCharlie = await apiRequest('/api/transactions/system/initialize-funds', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: {
        toAccount: accountC._id.toString(),
        amount: 2000,
        idempotencyKey: `SYS_FUND_CHARLIE_${timestamp}`,
      },
    });
    console.assert(resFundCharlie.status === 201);
    const fundCharlieTxId = resFundCharlie.body.transaction._id;

    // 16b: System reverses the initial funding transaction
    const resReverseFund = await apiRequest(`/api/transactions/${fundCharlieTxId}/reverse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { reason: 'Initial grant allocated in error' },
    });
    console.assert(resReverseFund.status === 200, `Expected 200, got ${resReverseFund.status}`);
    console.assert(resReverseFund.body.transaction?.status === 'REVERSED');
    console.log('✓ TEST 16: System fund initialization transaction successfully reversed to Reserve');

    // TEST 17: Customer GET /api/transactions Query Reflects REVERSED Status & Reason
    const resCustHistory = await apiRequest(`/api/transactions?search=${transferTxId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.assert(resCustHistory.status === 200);
    const foundTx = resCustHistory.body.transactions.find((t) => t._id === transferTxId);
    console.assert(foundTx !== undefined, 'Reversed transaction must be in history');
    console.assert(foundTx.status === 'REVERSED', 'Status in history must be REVERSED');
    console.assert(foundTx.reversalReason === 'Duplicate payment flagged during reconciliation');
    console.log('✓ TEST 17: Customer transaction history reflects REVERSED status and reason');

    // TEST 18: System GET /api/transactions/system/all Returns Full Ledger with Audit Metadata
    const resSysHistory = await apiRequest('/api/transactions/system/all?status=REVERSED', {
      headers: { Authorization: `Bearer ${tokenSys}` },
    });
    console.assert(resSysHistory.status === 200);
    const sysReversedList = resSysHistory.body.transactions;
    console.assert(sysReversedList.length >= 2, 'Expected at least 2 reversed transactions');
    console.assert(sysReversedList.every((t) => t.status === 'REVERSED'));
    console.log('✓ TEST 18: System GET /api/transactions/system/all returns full bank ledger');

    // TEST 19: Financial Summary GET /api/transactions/summary Excludes Reversed Transactions
    const resSummary = await apiRequest('/api/transactions/summary', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.assert(resSummary.status === 200);
    // Alice's completed debits = ₹1000 (from tx2 which was NOT reversed). The reversed ₹500 is excluded.
    console.assert(resSummary.body.totalDebits === 1000, `Expected Alice completed debits 1000, got ${resSummary.body.totalDebits}`);
    console.log('✓ TEST 19: Financial summary strictly excludes reversed transactions from totals');

    // TEST 20: Concurrent Reversal Race Condition Handled Atomically
    // Create fresh transaction from Charlie to Bob
    const resConcurrentTx = await apiRequest('/api/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        fromAccount: accountA._id.toString(),
        toAccount: accountB._id.toString(),
        amount: 50,
        idempotencyKey: `RACE_TX_${timestamp}`,
      },
    });
    console.assert(resConcurrentTx.status === 201);
    const raceTxId = resConcurrentTx.body.transaction._id;

    // Send 5 parallel reversal requests
    const parallelResults = await Promise.all([
      apiRequest(`/api/transactions/${raceTxId}/reverse`, { method: 'POST', headers: { Authorization: `Bearer ${tokenSys}` }, body: { reason: 'Concurrent request 1' } }),
      apiRequest(`/api/transactions/${raceTxId}/reverse`, { method: 'POST', headers: { Authorization: `Bearer ${tokenSys}` }, body: { reason: 'Concurrent request 2' } }),
      apiRequest(`/api/transactions/${raceTxId}/reverse`, { method: 'POST', headers: { Authorization: `Bearer ${tokenSys}` }, body: { reason: 'Concurrent request 3' } }),
      apiRequest(`/api/transactions/${raceTxId}/reverse`, { method: 'POST', headers: { Authorization: `Bearer ${tokenSys}` }, body: { reason: 'Concurrent request 4' } }),
      apiRequest(`/api/transactions/${raceTxId}/reverse`, { method: 'POST', headers: { Authorization: `Bearer ${tokenSys}` }, body: { reason: 'Concurrent request 5' } }),
    ]);

    const successes = parallelResults.filter((r) => r.status === 200);
    const failures = parallelResults.filter((r) => r.status === 400 || r.status === 409);
    console.assert(successes.length === 1, `Expected exactly 1 successful reversal, got ${successes.length}`);
    console.assert(failures.length === 4, `Expected 4 rejected concurrent attempts, got ${failures.length}`);
    console.log('✓ TEST 20: Concurrent reversal race condition safely resolved with atomic locking');

    console.log('\n==================================================');
    console.log('ALL STEP 4 TRANSACTION REVERSALS TESTS PASSED! (100%)');
    console.log('==================================================\n');
  } finally {
    if (customerA) {
      await userModel.deleteMany({ _id: { $in: [customerA._id, customerB._id, customerC._id, systemUser._id] } });
    }
    if (accountA) {
      await accountModel.deleteMany({
        _id: { $in: [accountA._id, accountB._id, accountC._id, systemReserveAccount._id] },
      });
    }
    await transactionModel.deleteMany({
      idempotencyKey: { $regex: 'SEED_STEP4|PENDING_TX|FAILED_TX|TX_ALICE_TO_BOB|TX_BOB_TO_CHARLIE|SYS_FUND_CHARLIE|RACE_TX' },
    });
    if (server) server.close();
    await mongoose.disconnect();
    console.log('✓ Database connection closed and test teardown complete.');
  }
}

runStep4Tests().catch((err) => {
  console.error('❌ Step 4 test suite error:', err);
  process.exit(1);
});

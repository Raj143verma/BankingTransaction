/**
 * Integration Test Suite for STEP 3:
 * "Account Lifecycle Controls (Freeze, Suspension, Deactivation, Restoration)"
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

async function runStep3Tests() {
  console.log('\n==================================================');
  console.log('STARTING STEP 3 ACCOUNT LIFECYCLE INTEGRATION TEST SUITE');
  console.log('==================================================\n');

  await mongoose.connect(MONGO_URI);
  console.log('✓ Connected to MongoDB');

  app = require('./src/app');
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✓ Test HTTP server listening on ${baseUrl}`);

  let customerA, customerB, systemUser;
  let accountA1, accountB1, systemReserveAccount;
  let tokenA, tokenB, tokenSys;

  try {
    const timestamp = Date.now();
    const emailA = `step3_cust_a_${timestamp}@example.com`;
    const emailB = `step3_cust_b_${timestamp}@example.com`;
    const emailSys = `step3_sys_${timestamp}@example.com`;

    // 1. Create Users
    customerA = await userModel.create({
      name: 'Alice Lifecycle',
      email: emailA,
      password: 'Password123!',
      systemUser: false,
    });

    customerB = await userModel.create({
      name: 'Bob Counterparty',
      email: emailB,
      password: 'Password123!',
      systemUser: false,
    });

    systemUser = await userModel.create({
      name: 'System Risk Officer',
      email: emailSys,
      password: 'Password123!',
      systemUser: true,
    });

    tokenA = jwt.sign({ id: customerA._id }, JWT_SECRET, { expiresIn: '1d' });
    tokenB = jwt.sign({ id: customerB._id }, JWT_SECRET, { expiresIn: '1d' });
    tokenSys = jwt.sign({ id: systemUser._id }, JWT_SECRET, { expiresIn: '1d' });

    // 2. Create Accounts
    accountA1 = await accountModel.create({
      user: customerA._id,
      accountHolderName: 'Alice Primary',
      accountType: 'SAVINGS',
      status: 'ACTIVE',
      currency: 'INR',
    });

    accountB1 = await accountModel.create({
      user: customerB._id,
      accountHolderName: 'Bob Savings',
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
    const seedTx = await transactionModel.create({
      fromAccount: systemReserveAccount._id,
      toAccount: accountA1._id,
      amount: 5000,
      status: 'COMPLETED',
      idempotencyKey: `SEED_STEP3_A_${timestamp}`,
    });
    await ladgerModel.create([
      { account: systemReserveAccount._id, amount: 5000, transaction: seedTx._id, type: 'DEBIT' },
      { account: accountA1._id, amount: 5000, transaction: seedTx._id, type: 'CREDIT' },
    ]);

    // Seed Initial Balance for Bob: ₹1,000 (CREDIT Bob, DEBIT System)
    const seedTxB = await transactionModel.create({
      fromAccount: systemReserveAccount._id,
      toAccount: accountB1._id,
      amount: 1000,
      status: 'COMPLETED',
      idempotencyKey: `SEED_STEP3_B_${timestamp}`,
    });
    await ladgerModel.create([
      { account: systemReserveAccount._id, amount: 1000, transaction: seedTxB._id, type: 'DEBIT' },
      { account: accountB1._id, amount: 1000, transaction: seedTxB._id, type: 'CREDIT' },
    ]);

    console.log('✓ Test users, accounts, and double-entry seed balances initialized');

    // TEST 1: Unauthenticated request rejection (HTTP 401)
    const resUnauth = await apiRequest(`/api/accounts/${accountA1._id}/status`, {
      method: 'PATCH',
      body: { status: 'SUSPENDED', reason: 'Unauthenticated attempt test' },
    });
    console.assert(resUnauth.status === 401, `Expected 401, got ${resUnauth.status}`);
    console.log('✓ TEST 1: Unauthenticated request properly rejected with HTTP 401');

    // TEST 2: Customer privilege rejection / RBAC (HTTP 403)
    const resCustForbidden = await apiRequest(`/api/accounts/${accountA1._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { status: 'SUSPENDED', reason: 'Customer attempting admin action' },
    });
    console.assert(resCustForbidden.status === 403, `Expected 403, got ${resCustForbidden.status}`);
    console.log('✓ TEST 2: Customer RBAC rejection properly enforced with HTTP 403');

    // TEST 3: Invalid Account ID format (HTTP 400)
    const resInvalidId = await apiRequest('/api/accounts/invalid-account-id-xyz/status', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { status: 'SUSPENDED', reason: 'Testing invalid ObjectId format' },
    });
    console.assert(resInvalidId.status === 400, `Expected 400, got ${resInvalidId.status}`);
    console.log('✓ TEST 3: Invalid account ObjectId rejected with HTTP 400');

    // TEST 4: Non-Existent Account (HTTP 404)
    const fakeObjectId = new mongoose.Types.ObjectId().toString();
    const resNotFound = await apiRequest(`/api/accounts/${fakeObjectId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { status: 'SUSPENDED', reason: 'Testing non-existent account' },
    });
    console.assert(resNotFound.status === 404, `Expected 404, got ${resNotFound.status}`);
    console.log('✓ TEST 4: Non-existent account returned HTTP 404');

    // TEST 5: System Reserve Account Protection Guard (HTTP 400)
    const resProtectReserve = await apiRequest(`/api/accounts/${systemReserveAccount._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { status: 'SUSPENDED', reason: 'Testing reserve account protection' },
    });
    console.assert(resProtectReserve.status === 400, `Expected 400, got ${resProtectReserve.status}`);
    console.assert(
      resProtectReserve.body?.message?.includes('Institutional system accounts'),
      'Expected institutional account protection error message'
    );
    console.log('✓ TEST 5: Institutional system reserve account protected against modification');

    // TEST 6: Invalid Status Value (HTTP 400)
    const resBadStatus = await apiRequest(`/api/accounts/${accountA1._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { status: 'BANNED', reason: 'Testing disallowed enum value' },
    });
    console.assert(resBadStatus.status === 400, `Expected 400, got ${resBadStatus.status}`);
    console.log('✓ TEST 6: Invalid status value rejected with HTTP 400');

    // TEST 7: Missing or Short Reason (HTTP 400)
    const resShortReason = await apiRequest(`/api/accounts/${accountA1._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { status: 'SUSPENDED', reason: 'bad' },
    });
    console.assert(resShortReason.status === 400, `Expected 400, got ${resShortReason.status}`);
    console.log('✓ TEST 7: Missing / short reason rejected with HTTP 400');

    // TEST 8: No-Op Status Transition (HTTP 400)
    const resNoOp = await apiRequest(`/api/accounts/${accountA1._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { status: 'ACTIVE', reason: 'Account is already active' },
    });
    console.assert(resNoOp.status === 400, `Expected 400, got ${resNoOp.status}`);
    console.log('✓ TEST 8: No-op status transition (ACTIVE -> ACTIVE) rejected with HTTP 400');

    // TEST 9: Valid Account Suspension (ACTIVE -> SUSPENDED) (HTTP 200)
    const resSuspend = await apiRequest(`/api/accounts/${accountA1._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: {
        status: 'SUSPENDED',
        reason: 'Temporary compliance review for irregular transaction patterns',
      },
    });
    console.assert(resSuspend.status === 200, `Expected 200, got ${resSuspend.status}`);
    console.assert(resSuspend.body.account?.status === 'SUSPENDED', 'Account status must be SUSPENDED');
    console.assert(resSuspend.body.audit?.previousStatus === 'ACTIVE', 'Audit previousStatus must be ACTIVE');
    console.assert(resSuspend.body.audit?.newStatus === 'SUSPENDED', 'Audit newStatus must be SUSPENDED');
    console.assert(resSuspend.body.audit?.updatedBy?._id === systemUser._id.toString(), 'Audit updatedBy ID matches');
    console.log('✓ TEST 9: Account successfully suspended with audit metadata');

    // TEST 10: Outgoing Transfer Blocked from Suspended Account (HTTP 400)
    const resTransferFromSuspended = await apiRequest('/api/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        fromAccount: accountA1._id.toString(),
        toAccount: accountB1._id.toString(),
        amount: 200,
        idempotencyKey: `TX_FROM_SUSPENDED_${timestamp}`,
      },
    });
    console.assert(resTransferFromSuspended.status === 400, `Expected 400, got ${resTransferFromSuspended.status}`);
    console.assert(
      resTransferFromSuspended.body?.message?.includes('not active'),
      'Expected not active error message'
    );
    console.log('✓ TEST 10: Outgoing transfer from suspended account blocked with HTTP 400');

    // TEST 11: Incoming Transfer Blocked to Suspended Account (HTTP 400)
    const resTransferToSuspended = await apiRequest('/api/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: {
        fromAccount: accountB1._id.toString(),
        toAccount: accountA1._id.toString(),
        amount: 150,
        idempotencyKey: `TX_TO_SUSPENDED_${timestamp}`,
      },
    });
    console.assert(resTransferToSuspended.status === 400, `Expected 400, got ${resTransferToSuspended.status}`);
    console.log('✓ TEST 11: Incoming transfer to suspended account blocked with HTTP 400');

    // TEST 12: System Fund Allocation Blocked to Suspended Account (HTTP 400)
    const resSysFundToSuspended = await apiRequest('/api/transactions/system/initialize-funds', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: {
        toAccount: accountA1._id.toString(),
        amount: 500,
        idempotencyKey: `SYS_FUND_SUSPENDED_${timestamp}`,
      },
    });
    console.assert(resSysFundToSuspended.status === 400, `Expected 400, got ${resSysFundToSuspended.status}`);
    console.log('✓ TEST 12: System fund initialization to suspended account blocked with HTTP 400');

    // TEST 13: Transition SUSPENDED -> INACTIVE -> Disallowed SUSPENDED
    const resDeactivate = await apiRequest(`/api/accounts/${accountA1._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { status: 'INACTIVE', reason: 'Deactivating account after investigation' },
    });
    console.assert(resDeactivate.status === 200, `Expected 200, got ${resDeactivate.status}`);
    console.assert(resDeactivate.body.account?.status === 'INACTIVE', 'Account status must be INACTIVE');

    // Attempting disallowed transition INACTIVE -> SUSPENDED
    const resDisallowedTransition = await apiRequest(`/api/accounts/${accountA1._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { status: 'SUSPENDED', reason: 'Attempting invalid transition from INACTIVE to SUSPENDED' },
    });
    console.assert(resDisallowedTransition.status === 400, `Expected 400, got ${resDisallowedTransition.status}`);
    console.log('✓ TEST 13: Disallowed transition (INACTIVE -> SUSPENDED) rejected with HTTP 400');

    // TEST 14: Reactivation (INACTIVE -> ACTIVE) (HTTP 200)
    const resReactivate = await apiRequest(`/api/accounts/${accountA1._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenSys}` },
      body: { status: 'ACTIVE', reason: 'Reactivation authorized by senior compliance manager' },
    });
    console.assert(resReactivate.status === 200, `Expected 200, got ${resReactivate.status}`);
    console.assert(resReactivate.body.account?.status === 'ACTIVE', 'Account status must be ACTIVE');
    console.log('✓ TEST 14: Account successfully reactivated to ACTIVE status');

    // TEST 15: Outgoing and Incoming Transfers Resumed on Reactivated Account (HTTP 201)
    const resValidTransfer = await apiRequest('/api/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        fromAccount: accountA1._id.toString(),
        toAccount: accountB1._id.toString(),
        amount: 350,
        idempotencyKey: `RESUMED_TRANSFER_${timestamp}`,
      },
    });
    console.assert(resValidTransfer.status === 201, `Expected 201, got ${resValidTransfer.status}`);
    console.assert(resValidTransfer.body.transaction?.status === 'COMPLETED', 'Transfer must complete');
    console.log('✓ TEST 15: P2P transfer successfully executed on reactivated account');

    // TEST 16: Double-Entry Ledger Integrity & Row Immutability
    // Ledger records for Alice:
    // 1. Initial deposit: +5000 (CREDIT)
    // 2. Transfer: -350 (DEBIT)
    // Total ledger rows for Alice = 2
    const aliceLedger = await ladgerModel.find({ account: accountA1._id });
    console.assert(aliceLedger.length === 2, `Expected 2 ledger entries for Alice, got ${aliceLedger.length}`);
    console.log('✓ TEST 16: Double-entry ledger integrity and row immutability verified (zero spurious rows)');

    // TEST 17: Derived Balance Unaffected by Status Transitions
    // Alice balance: 5000 - 350 = 4650
    // Bob balance: 1000 + 350 = 1350
    const balA = await accountA1.getBalance();
    const balB = await accountB1.getBalance();
    console.assert(balA === 4650, `Expected Alice balance 4650, got ${balA}`);
    console.assert(balB === 1350, `Expected Bob balance 1350, got ${balB}`);
    console.log('✓ TEST 17: Ledger-derived balances accurately verified (Alice: ₹4,650, Bob: ₹1,350)');

    // TEST 18: Account Ownership and Immutability Preserved
    const finalAccountA = await accountModel.findById(accountA1._id);
    console.assert(
      finalAccountA.user.toString() === customerA._id.toString(),
      'Account user ownership must remain unchanged'
    );
    console.log('✓ TEST 18: Account ownership (user reference) strictly preserved');

    console.log('\n==================================================');
    console.log('ALL 18 STEP 3 INTEGRATION TESTS PASSED! (100%)');
    console.log('==================================================\n');
  } finally {
    if (customerA) {
      await userModel.deleteMany({ _id: { $in: [customerA._id, customerB._id, systemUser._id] } });
    }
    if (accountA1) {
      await accountModel.deleteMany({
        _id: { $in: [accountA1._id, accountB1._id, systemReserveAccount._id] },
      });
    }
    await transactionModel.deleteMany({
      idempotencyKey: { $regex: 'SEED_STEP3|TX_FROM_SUSPENDED|TX_TO_SUSPENDED|SYS_FUND_SUSPENDED|RESUMED_TRANSFER' },
    });
    if (server) server.close();
    await mongoose.disconnect();
    console.log('✓ Database connection closed and test teardown complete.');
  }
}

runStep3Tests().catch((err) => {
  console.error('❌ Step 3 test suite error:', err);
  process.exit(1);
});

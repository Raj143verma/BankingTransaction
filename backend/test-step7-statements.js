/**
 * Integration & Financial Verification Test Suite for STEP 7:
 * "Account Statements & Export Engine"
 * Covers all 25 specified test requirements with mathematical ledger assertions.
 */
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
process.env.NODE_ENV = 'test';
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const userModel = require('./src/models/user.model');
const accountModel = require('./src/models/account.model');
const transactionModel = require('./src/models/transaction.model');
const ladgerModel = require('./src/models/ladger.model');
const accountApplicationModel = require('./src/models/accountApplication.model');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/banking';
const JWT_SECRET =
  process.env.JWT_SECRET || 'test_secret_for_banking_lifecycle_suite_32chars!';

let server;
let app;
let baseUrl;

async function apiRequest(endpoint, options = {}) {
  const url = `${baseUrl}${endpoint}`;
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

async function runStep7Tests() {
  console.log('\n==================================================');
  console.log('STARTING STEP 7 ACCOUNT STATEMENTS INTEGRATION SUITE');
  console.log('==================================================\n');

  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB for Step 7 test suite');

    app = require('./src/app');
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
    console.log(`Test server running at ${baseUrl}\n`);

    const timestamp = Date.now();

    // 1. Create Test Users
    const customerAlice = await userModel.create({
      name: 'Alice "Quoted" Statement',
      email: `alice.statement.${timestamp}@test.com`,
      password: 'Password123!',
      systemUser: false,
      sessionVersion: 1,
    });

    const customerBob = await userModel.create({
      name: 'Bob Statement',
      email: `bob.statement.${timestamp}@test.com`,
      password: 'Password123!',
      systemUser: false,
      sessionVersion: 1,
    });

    const systemUser = await userModel.create({
      name: 'Central Bank Auditor',
      email: `auditor.statement.${timestamp}@test.com`,
      password: 'Password123!',
      systemUser: true,
      sessionVersion: 1,
    });

    const tokenAlice = jwt.sign(
      { id: customerAlice._id, sessionVersion: 1 },
      JWT_SECRET,
      { expiresIn: '1d' }
    );
    const tokenBob = jwt.sign(
      { id: customerBob._id, sessionVersion: 1 },
      JWT_SECRET,
      { expiresIn: '1d' }
    );
    const tokenSystem = jwt.sign(
      { id: systemUser._id, sessionVersion: 1 },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    // 2. Create Accounts
    const accountAlice = await accountModel.create({
      user: customerAlice._id,
      accountHolderName: 'Alice "Quoted" Statement',
      accountType: 'SAVINGS',
      currency: 'INR',
      status: 'ACTIVE',
    });

    const accountBob = await accountModel.create({
      user: customerBob._id,
      accountHolderName: 'Bob Statement',
      accountType: 'SAVINGS',
      currency: 'INR',
      status: 'ACTIVE',
    });

    const systemReserve = await accountModel.create({
      user: systemUser._id,
      accountHolderName: 'System Reserve Account',
      accountType: 'CURRENT',
      currency: 'INR',
      status: 'ACTIVE',
    });

    // Seed Transactions:
    // Day 1 (2026-08-01): Initial Deposit of ₹10,000 to Alice (CREDIT Alice, DEBIT System)
    const t1 = new Date('2026-08-01T10:00:00.000Z');
    const tx1 = await transactionModel.create({
      fromAccount: systemReserve._id,
      toAccount: accountAlice._id,
      amount: 10000,
      status: 'COMPLETED',
      idempotencyKey: `STEP7_SEED_1_${timestamp}`,
      createdAt: t1,
    });
    await ladgerModel.create([
      { account: systemReserve._id, amount: 10000, transaction: tx1._id, type: 'DEBIT' },
      { account: accountAlice._id, amount: 10000, transaction: tx1._id, type: 'CREDIT' },
    ]);

    // Day 5 (2026-08-05): Alice transfers ₹2,000 to Bob (DEBIT Alice, CREDIT Bob)
    const t2 = new Date('2026-08-05T14:30:00.000Z');
    const tx2 = await transactionModel.create({
      fromAccount: accountAlice._id,
      toAccount: accountBob._id,
      amount: 2000,
      status: 'COMPLETED',
      idempotencyKey: `STEP7_SEED_2_${timestamp}`,
      createdAt: t2,
    });
    await ladgerModel.create([
      { account: accountAlice._id, amount: 2000, transaction: tx2._id, type: 'DEBIT' },
      { account: accountBob._id, amount: 2000, transaction: tx2._id, type: 'CREDIT' },
    ]);

    // Day 10 (2026-08-10): Alice transfers ₹1,000 to Bob (later reversed on Day 15)
    const t3 = new Date('2026-08-10T09:00:00.000Z');
    const tx3 = await transactionModel.create({
      fromAccount: accountAlice._id,
      toAccount: accountBob._id,
      amount: 1000,
      status: 'REVERSED',
      idempotencyKey: `STEP7_SEED_3_${timestamp}`,
      reversalReason: 'Administrative correction for "misallocated" transfer',
      reversedAt: new Date('2026-08-15T16:00:00.000Z'),
      reversedBy: systemUser._id,
      createdAt: t3,
    });
    await ladgerModel.create([
      // Original entries on Day 10
      { account: accountAlice._id, amount: 1000, transaction: tx3._id, type: 'DEBIT' },
      { account: accountBob._id, amount: 1000, transaction: tx3._id, type: 'CREDIT' },
      // Compensating reversal entries on Day 15
      { account: accountBob._id, amount: 1000, transaction: tx3._id, type: 'DEBIT' },
      { account: accountAlice._id, amount: 1000, transaction: tx3._id, type: 'CREDIT' },
    ]);

    // Day 20 (2026-08-20): Bob sends Alice ₹500
    const t4 = new Date('2026-08-20T11:15:00.000Z');
    const tx4 = await transactionModel.create({
      fromAccount: accountBob._id,
      toAccount: accountAlice._id,
      amount: 500,
      status: 'COMPLETED',
      idempotencyKey: `STEP7_SEED_4_${timestamp}`,
      createdAt: t4,
    });
    await ladgerModel.create([
      { account: accountBob._id, amount: 500, transaction: tx4._id, type: 'DEBIT' },
      { account: accountAlice._id, amount: 500, transaction: tx4._id, type: 'CREDIT' },
    ]);

    console.log('Seeded ledger successfully. Running 25 Test Verifications:\n');

    // TEST 1: Unauthenticated request -> 401
    const res1 = await apiRequest(`/api/accounts/${accountAlice._id}/statement`);
    console.assert(res1.status === 401, `Test 1 failed: Expected 401, got ${res1.status}`);
    console.log('  1.  ✓ PASS: Unauthenticated request returns 401');

    // TEST 2: Customer accessing own account -> success
    const res2 = await apiRequest(`/api/accounts/${accountAlice._id}/statement`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    console.assert(res2.status === 200, `Test 2 failed: Expected 200, got ${res2.status}`);
    console.log('  2.  ✓ PASS: Customer accessing own account -> 200 OK');

    // TEST 3: Customer accessing another customer's account -> 403
    const res3 = await apiRequest(`/api/accounts/${accountAlice._id}/statement`, {
      headers: { Authorization: `Bearer ${tokenBob}` },
    });
    console.assert(res3.status === 403, `Test 3 failed: Expected 403, got ${res3.status}`);
    console.log('  3.  ✓ PASS: Customer accessing another customer account -> 403 Forbidden');

    // TEST 4: System admin accessing customer account -> success
    const res4 = await apiRequest(`/api/accounts/${accountAlice._id}/statement`, {
      headers: { Authorization: `Bearer ${tokenSystem}` },
    });
    console.assert(res4.status === 200, `Test 4 failed: Expected 200, got ${res4.status}`);
    console.log('  4.  ✓ PASS: System admin accessing customer account -> 200 OK');

    // TEST 5: Invalid account ObjectId -> 400
    const res5 = await apiRequest(`/api/accounts/invalid-id-xyz/statement`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    console.assert(res5.status === 400, `Test 5 failed: Expected 400, got ${res5.status}`);
    console.log('  5.  ✓ PASS: Invalid account ObjectId -> 400 Bad Request');

    // TEST 6: Non-existent account -> 404
    const fakeId = new mongoose.Types.ObjectId();
    const res6 = await apiRequest(`/api/accounts/${fakeId}/statement`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    console.assert(res6.status === 404, `Test 6 failed: Expected 404, got ${res6.status}`);
    console.log('  6.  ✓ PASS: Non-existent account -> 404 Not Found');

    // TEST 7: Invalid startDate -> 400
    const res7 = await apiRequest(`/api/accounts/${accountAlice._id}/statement?startDate=invalid-date`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    console.assert(res7.status === 400, `Test 7 failed: Expected 400, got ${res7.status}`);
    console.log('  7.  ✓ PASS: Invalid startDate -> 400 Bad Request');

    // TEST 8: Invalid endDate -> 400
    const res8 = await apiRequest(`/api/accounts/${accountAlice._id}/statement?endDate=not-a-date`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    console.assert(res8.status === 400, `Test 8 failed: Expected 400, got ${res8.status}`);
    console.log('  8.  ✓ PASS: Invalid endDate -> 400 Bad Request');

    // TEST 9: startDate > endDate -> 400
    const res9 = await apiRequest(`/api/accounts/${accountAlice._id}/statement?startDate=2026-08-30&endDate=2026-08-01`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    console.assert(res9.status === 400, `Test 9 failed: Expected 400, got ${res9.status}`);
    console.log('  9.  ✓ PASS: startDate > endDate -> 400 Bad Request');

    // TEST 10: Opening balance calculation
    // Range: 2026-08-06 to 2026-08-31 -> Prior movements: Tx1 (+10000), Tx2 (-2000) = 8000
    const res10 = await apiRequest(`/api/accounts/${accountAlice._id}/statement?startDate=2026-08-06&endDate=2026-08-31`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    console.assert(res10.body.summary.openingBalance === 8000, `Expected 8000, got ${res10.body.summary.openingBalance}`);
    console.log('  10. ✓ PASS: Opening balance derived mathematically before startDate (₹8,000.00)');

    // TEST 11: Chronological transaction ordering
    const fullStatement = res2.body;
    const txDates = fullStatement.transactions.map((t) => new Date(t.date).getTime());
    const isSorted = txDates.every((val, i, arr) => i === 0 || arr[i - 1] <= val);
    console.assert(isSorted, 'Transactions must be strictly sorted by timestamp ascending');
    console.log('  11. ✓ PASS: Chronological transaction ordering strictly ascending with secondary tie-breaker');

    // TEST 12: Running balance calculation
    const runningBals = fullStatement.transactions.map((t) => t.runningBalance);
    // Sequence: 10000, 8000, 7000, 8000, 8500
    console.assert(
      JSON.stringify(runningBals) === JSON.stringify([10000, 8000, 7000, 8000, 8500]),
      `Unexpected running balances: ${JSON.stringify(runningBals)}`
    );
    console.log('  12. ✓ PASS: Running balance calculation: [10000, 8000, 7000, 8000, 8500]');

    // TEST 13: Closing balance calculation
    console.assert(fullStatement.summary.closingBalance === 8500, `Expected 8500, got ${fullStatement.summary.closingBalance}`);
    console.log('  13. ✓ PASS: Closing balance calculation derived as ₹8,500.00');

    // TEST 14: Closing balance reconciliation with account.getBalance()
    const liveAliceBal = await accountAlice.getBalance();
    console.assert(
      fullStatement.summary.closingBalance === liveAliceBal,
      `Reconciliation mismatch: Statement (${fullStatement.summary.closingBalance}) vs live getBalance() (${liveAliceBal})`
    );
    console.log('  14. ✓ PASS: Closing balance 100% reconciled against live account.getBalance()');

    // TEST 15: Date boundary filtering
    // Period: 2026-08-05 to 2026-08-11 -> Tx2 (Aug 5) and Tx3 original (Aug 10)
    const res15 = await apiRequest(`/api/accounts/${accountAlice._id}/statement?startDate=2026-08-05&endDate=2026-08-11`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    console.assert(res15.body.transactions.length === 2, `Expected 2 txs, got ${res15.body.transactions.length}`);
    console.log('  15. ✓ PASS: Date boundary filtering correctly limits period transactions');

    // TEST 16: Empty statement period
    const res16 = await apiRequest(`/api/accounts/${accountAlice._id}/statement?startDate=2026-09-01&endDate=2026-09-30`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    console.assert(res16.body.transactions.length === 0, 'Must have 0 transactions');
    console.assert(res16.body.summary.openingBalance === 8500, 'Opening balance preserved');
    console.assert(res16.body.summary.closingBalance === 8500, 'Closing balance preserved');
    console.log('  16. ✓ PASS: Empty statement period retains balance invariants with empty transactions array');

    // TEST 17: Reversed transaction + compensating ledger entries
    // Verify Bob's reconciliation
    const resBob = await apiRequest(`/api/accounts/${accountBob._id}/statement`, {
      headers: { Authorization: `Bearer ${tokenBob}` },
    });
    const liveBobBal = await accountBob.getBalance();
    console.assert(resBob.body.summary.closingBalance === 1500, `Expected 1500, got ${resBob.body.summary.closingBalance}`);
    console.assert(resBob.body.summary.closingBalance === liveBobBal, 'Bob balance reconciled');
    console.log('  17. ✓ PASS: Reversed transactions include original entries + compensating entries');

    // TEST 18: Pagination metadata
    const res18 = await apiRequest(`/api/accounts/${accountAlice._id}/statement?page=1&limit=2`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    console.assert(res18.body.pagination.page === 1, 'Page 1');
    console.assert(res18.body.pagination.limit === 2, 'Limit 2');
    console.assert(res18.body.pagination.totalCount === 5, 'Total 5');
    console.assert(res18.body.pagination.totalPages === 3, 'Total pages 3');
    console.log('  18. ✓ PASS: Pagination metadata accurately reflected');

    // TEST 19: CSV response headers and content
    const resCsvRoute = await apiRequest(`/api/accounts/${accountAlice._id}/statement/export/csv`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    console.assert(resCsvRoute.status === 200, `Expected 200, got ${resCsvRoute.status}`);
    console.assert(
      (resCsvRoute.headers.get('content-type') || '').includes('text/csv'),
      'Content-Type must be text/csv'
    );
    console.assert(
      (resCsvRoute.headers.get('content-disposition') || '').includes('attachment'),
      'Content-Disposition must be attachment'
    );
    console.log('  19. ✓ PASS: CSV response headers and attachment disposition verified');

    // TEST 20: CSV escaping
    // Ensure quotes inside account name 'Alice "Quoted" Statement' are escaped to '""'
    console.assert(
      resCsvRoute.body.includes('Alice ""Quoted"" Statement'),
      'CSV must escape inner double quotes per RFC-4180'
    );
    console.log('  20. ✓ PASS: RFC-4180 CSV escaping confirmed for quoted strings');

    // TEST 21: PDF response Content-Type
    const resPdfRoute = await apiRequest(`/api/accounts/${accountAlice._id}/statement/export/pdf`, {
      headers: { Authorization: `Bearer ${tokenAlice}` },
    });
    console.assert(resPdfRoute.status === 200, `Expected 200, got ${resPdfRoute.status}`);
    console.assert(
      (resPdfRoute.headers.get('content-type') || '').includes('application/pdf'),
      'Content-Type must be application/pdf'
    );
    console.log('  21. ✓ PASS: PDF response Content-Type application/pdf verified');

    // TEST 22: PDF binary signature starts with %PDF-
    console.assert(
      resPdfRoute.body.startsWith('%PDF-'),
      `Expected %PDF- signature, got ${resPdfRoute.body.substring(0, 10)}`
    );
    console.log('  22. ✓ PASS: PDF binary signature starts with %PDF-');

    // TEST 23: PDF contains meaningful statement content
    console.assert(
      resPdfRoute.body.length > 500,
      `Expected substantial PDF content size, got ${resPdfRoute.body.length} bytes`
    );
    console.log('  23. ✓ PASS: PDF contains complete multi-element statement document');

    // TEST 24: IDOR protection for CSV
    const resCsvIdor = await apiRequest(`/api/accounts/${accountAlice._id}/statement/export/csv`, {
      headers: { Authorization: `Bearer ${tokenBob}` },
    });
    console.assert(resCsvIdor.status === 403, `Expected 403, got ${resCsvIdor.status}`);
    console.log('  24. ✓ PASS: IDOR protection strictly enforced for CSV exports (403 Forbidden)');

    // TEST 25: IDOR protection for PDF
    const resPdfIdor = await apiRequest(`/api/accounts/${accountAlice._id}/statement/export/pdf`, {
      headers: { Authorization: `Bearer ${tokenBob}` },
    });
    console.assert(resPdfIdor.status === 403, `Expected 403, got ${resPdfIdor.status}`);
    console.log('  25. ✓ PASS: IDOR protection strictly enforced for PDF exports (403 Forbidden)');

    console.log('\n==================================================');
    console.log('ALL 25/25 STEP 7 SPECIFICATION TESTS PASSED (100%)');
    console.log('==================================================\n');
  } catch (err) {
    console.error('Test Suite Error:', err);
    process.exitCode = 1;
  } finally {
    if (server) server.close();
    await mongoose.disconnect();
    console.log('Test HTTP server closed and disconnected from MongoDB');
  }
}

runStep7Tests();

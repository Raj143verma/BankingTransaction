require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('./src/app');

const userModel = require('./src/models/user.model');
const accountModel = require('./src/models/account.model');
const ladgerModel = require('./src/models/ladger.model');
const transactionModel = require('./src/models/transaction.model');
const auditLogModel = require('./src/models/auditLog.model');
const notificationModel = require('./src/models/notification.model');
const transferLimitConfigModel = require('./src/models/transferLimitConfig.model');

let server;
let baseUrl;

function logTest(testNum, title, passed, details = '') {
  const icon = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`  ${String(testNum).padStart(2, ' ')}. ${icon}: ${title}`);
  if (!passed && details) {
    console.error(`       Details: ${details}`);
  }
}

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, data, headers: res.headers };
}

function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      sessionVersion: user.sessionVersion || 1,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function getDerivedBalance(accountId) {
  const accountObjectId = new mongoose.Types.ObjectId(accountId);
  const result = await ladgerModel.aggregate([
    { $match: { account: accountObjectId } },
    {
      $group: {
        _id: '$account',
        totalDebit: {
          $sum: { $cond: [{ $eq: ['$type', 'DEBIT'] }, '$amount', 0] },
        },
        totalCredit: {
          $sum: { $cond: [{ $eq: ['$type', 'CREDIT'] }, '$amount', 0] },
        },
      },
    },
    {
      $project: {
        balance: { $subtract: ['$totalCredit', '$totalDebit'] },
      },
    },
  ]);
  return result[0]?.balance || 0;
}

async function runTests() {
  console.log('\n==================================================');
  console.log('STARTING STEP 10 DEPOSITS, WITHDRAWALS & VAULT SUITE');
  console.log('==================================================\n');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB for Step 10 test suite');

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Step 10 test server listening on port ${port}\n`);

  let passedCount = 0;
  let failedCount = 0;
  let currentTest = 1;

  function assert(title, condition, details = '') {
    if (condition) {
      logTest(currentTest, title, true);
      passedCount++;
    } else {
      logTest(currentTest, title, false, details);
      failedCount++;
    }
    currentTest++;
  }

  try {
    const timestamp = Date.now();

    // 1. Setup Test Users & Accounts
    const systemUser = await userModel.findOne({ systemUser: true });
    if (!systemUser) {
      throw new Error('System user not found. Please ensure database is seeded.');
    }

    const customerUserA = await userModel.create({
      name: `Alice Step10 ${timestamp}`,
      email: `alice.step10.${timestamp}@bank.com`,
      password: 'StrongPassword123!',
      systemUser: false,
      sessionVersion: 1,
    });
    const tokenA = generateToken(customerUserA);

    const customerUserB = await userModel.create({
      name: `Bob Step10 ${timestamp}`,
      email: `bob.step10.${timestamp}@bank.com`,
      password: 'StrongPassword123!',
      systemUser: false,
      sessionVersion: 1,
    });
    const tokenB = generateToken(customerUserB);

    const accountA = await accountModel.create({
      user: customerUserA._id,
      accountHolderName: customerUserA.name,
      accountType: 'SAVINGS',
      currency: 'INR',
      status: 'ACTIVE',
    });

    const accountB = await accountModel.create({
      user: customerUserB._id,
      accountHolderName: customerUserB.name,
      accountType: 'SAVINGS',
      currency: 'INR',
      status: 'ACTIVE',
    });

    const suspendedAccountA = await accountModel.create({
      user: customerUserA._id,
      accountHolderName: customerUserA.name,
      accountType: 'SAVINGS',
      currency: 'INR',
      status: 'SUSPENDED',
    });

    const inactiveAccountA = await accountModel.create({
      user: customerUserA._id,
      accountHolderName: customerUserA.name,
      accountType: 'SAVINGS',
      currency: 'INR',
      status: 'INACTIVE',
    });

    // -------------------------------------------------------------
    // PART 1: AUTHENTICATION & INPUT VALIDATION
    // -------------------------------------------------------------
    console.log('\n--- PART 1: Authentication & Authorization Security ---');

    // Test 1: Unauthenticated deposit returns 401
    const unauthDeposit = await request('/api/transactions/deposit', {
      method: 'POST',
      body: { accountId: accountA._id.toString(), amount: 1000, idempotencyKey: `UNAUTH_DEP_${timestamp}` },
    });
    assert(
      'Unauthenticated POST /api/transactions/deposit returns 401',
      unauthDeposit.status === 401,
      `Expected 401, got ${unauthDeposit.status}`
    );

    // Test 2: Unauthenticated withdraw returns 401
    const unauthWithdraw = await request('/api/transactions/withdraw', {
      method: 'POST',
      body: { accountId: accountA._id.toString(), amount: 500, idempotencyKey: `UNAUTH_WTH_${timestamp}` },
    });
    assert(
      'Unauthenticated POST /api/transactions/withdraw returns 401',
      unauthWithdraw.status === 401,
      `Expected 401, got ${unauthWithdraw.status}`
    );

    // Test 3: IDOR prevention on deposit - User B cannot deposit to User A's account
    const idorDeposit = await request('/api/transactions/deposit', {
      method: 'POST',
      token: tokenB,
      body: { accountId: accountA._id.toString(), amount: 1000, idempotencyKey: `IDOR_DEP_${timestamp}` },
    });
    assert(
      'IDOR: User B attempting to deposit to User A account returns 403',
      idorDeposit.status === 403,
      `Expected 403, got ${idorDeposit.status} (${JSON.stringify(idorDeposit.data)})`
    );

    // Test 4: IDOR prevention on withdraw - User B cannot withdraw from User A's account
    const idorWithdraw = await request('/api/transactions/withdraw', {
      method: 'POST',
      token: tokenB,
      body: { accountId: accountA._id.toString(), amount: 500, idempotencyKey: `IDOR_WTH_${timestamp}` },
    });
    assert(
      'IDOR: User B attempting to withdraw from User A account returns 403',
      idorWithdraw.status === 403,
      `Expected 403, got ${idorWithdraw.status} (${JSON.stringify(idorWithdraw.data)})`
    );

    // Test 5: Validation - Missing or non-positive deposit amount
    const invalidDeposit1 = await request('/api/transactions/deposit', {
      method: 'POST',
      token: tokenA,
      body: { accountId: accountA._id.toString(), amount: -100, idempotencyKey: `NEG_DEP_${timestamp}` },
    });
    assert(
      'Validation: Negative deposit amount rejected with 400',
      invalidDeposit1.status === 400,
      `Expected 400, got ${invalidDeposit1.status}`
    );

    const invalidDeposit2 = await request('/api/transactions/deposit', {
      method: 'POST',
      token: tokenA,
      body: { accountId: accountA._id.toString(), amount: 0, idempotencyKey: `ZERO_DEP_${timestamp}` },
    });
    assert(
      'Validation: Zero deposit amount rejected with 400',
      invalidDeposit2.status === 400,
      `Expected 400, got ${invalidDeposit2.status}`
    );

    // Test 6: Validation - Suspended account deposit rejected
    const suspendedDeposit = await request('/api/transactions/deposit', {
      method: 'POST',
      token: tokenA,
      body: { accountId: suspendedAccountA._id.toString(), amount: 500, idempotencyKey: `SUSP_DEP_${timestamp}` },
    });
    assert(
      'Suspended account cash deposit rejected with 400',
      suspendedDeposit.status === 400,
      `Expected 400, got ${suspendedDeposit.status} (${JSON.stringify(suspendedDeposit.data)})`
    );

    // Test 7: Validation - Inactive account deposit rejected
    const inactiveDeposit = await request('/api/transactions/deposit', {
      method: 'POST',
      token: tokenA,
      body: { accountId: inactiveAccountA._id.toString(), amount: 500, idempotencyKey: `INACT_DEP_${timestamp}` },
    });
    assert(
      'Inactive account cash deposit rejected with 400',
      inactiveDeposit.status === 400,
      `Expected 400, got ${inactiveDeposit.status}`
    );

    // -------------------------------------------------------------
    // PART 2: DIRECT CASH DEPOSIT & DOUBLE-ENTRY LEDGER
    // -------------------------------------------------------------
    console.log('\n--- PART 2: Direct Cash Deposit & Ledger Invariants ---');

    const initialBalA = await getDerivedBalance(accountA._id);
    assert('Initial Alice account derived ledger balance is 0', initialBalA === 0, `Expected 0, got ${initialBalA}`);

    const depIdempotencyKey = `DEP_TEST_${timestamp}_1`;
    const depositAmount = 5000;

    // Test 8: Successful cash deposit
    const depositRes = await request('/api/transactions/deposit', {
      method: 'POST',
      token: tokenA,
      body: {
        accountId: accountA._id.toString(),
        amount: depositAmount,
        description: 'Branch Counter Cash Deposit',
        idempotencyKey: depIdempotencyKey,
      },
    });

    assert(
      'Successful cash deposit returns 201 Created',
      depositRes.status === 201 && depositRes.data?.success === true,
      `Expected 201, got ${depositRes.status} (${JSON.stringify(depositRes.data)})`
    );

    const txDepositId = depositRes.data?.transaction?._id;
    const depositTxDoc = await transactionModel.findById(txDepositId);

    assert(
      'Deposit transaction record created with status COMPLETED and valid accounts',
      depositTxDoc && depositTxDoc.status === 'COMPLETED' && depositTxDoc.toAccount.toString() === accountA._id.toString(),
      `Transaction record: ${JSON.stringify(depositTxDoc)}`
    );

    // Verify double-entry ledger entries for deposit
    const depositLedgerEntries = await ladgerModel.find({ transaction: depositTxDoc._id });
    assert(
      'Exactly 2 ledger entries created for deposit transaction',
      depositLedgerEntries.length === 2,
      `Found ${depositLedgerEntries.length} entries`
    );

    const vaultEntry = depositLedgerEntries.find((e) => e.type === 'DEBIT');
    const customerEntry = depositLedgerEntries.find((e) => e.type === 'CREDIT');

    assert(
      'Deposit ledger: DEBIT Cash Vault account and CREDIT Customer account with exact amounts',
      vaultEntry &&
        customerEntry &&
        vaultEntry.amount === depositAmount &&
        customerEntry.amount === depositAmount &&
        customerEntry.account.toString() === accountA._id.toString(),
      `Vault entry: ${JSON.stringify(vaultEntry)}, Customer entry: ${JSON.stringify(customerEntry)}`
    );

    // Verify Cash Vault account properties
    const vaultAccount = await accountModel.findById(vaultEntry.account);
    const vaultUser = await userModel.findById(vaultAccount.user);
    assert(
      'CASH_VAULT is a dedicated system account owned by system user',
      vaultAccount && vaultUser && vaultUser.systemUser === true && vaultAccount.accountHolderName === 'System Cash Vault',
      `Vault account: ${JSON.stringify(vaultAccount)}`
    );

    // Test 9: Verify updated derived ledger balance
    const postDepositBalA = await getDerivedBalance(accountA._id);
    assert(
      'Alice derived ledger balance updated from 0 to +5000',
      postDepositBalA === 5000,
      `Expected 5000, got ${postDepositBalA}`
    );

    // Test 10: Deposit Idempotency replay
    const depReplayRes = await request('/api/transactions/deposit', {
      method: 'POST',
      token: tokenA,
      body: {
        accountId: accountA._id.toString(),
        amount: depositAmount,
        description: 'Branch Counter Cash Deposit',
        idempotencyKey: depIdempotencyKey,
      },
    });
    assert(
      'Deposit Idempotency: Replaying request with same idempotencyKey returns 200/201 with identical tx ID',
      (depReplayRes.status === 200 || depReplayRes.status === 201) &&
        depReplayRes.data?.transaction?._id === txDepositId,
      `Expected same tx ID ${txDepositId}, got ${depReplayRes.status} (${JSON.stringify(depReplayRes.data)})`
    );

    const postReplayBalA = await getDerivedBalance(accountA._id);
    assert(
      'Deposit Idempotency: Derived balance remained exactly 5000 (no double deposit)',
      postReplayBalA === 5000,
      `Expected 5000, got ${postReplayBalA}`
    );

    // Test 11: Audit log and notification created for deposit
    const depositAudit = await auditLogModel.findOne({
      resourceId: txDepositId.toString(),
      action: 'CASH_DEPOSIT',
    });
    assert(
      'Audit log recorded for cash deposit (action: CASH_DEPOSIT)',
      Boolean(depositAudit),
      `Deposit audit: ${JSON.stringify(depositAudit)}`
    );

    const depositNotif = await notificationModel.findOne({
      recipient: customerUserA._id,
      type: 'TRANSACTION_RECEIVED',
      relatedResourceId: txDepositId.toString(),
    });
    assert(
      'In-app notification generated for cash deposit recipient',
      Boolean(depositNotif),
      `Deposit notif: ${JSON.stringify(depositNotif)}`
    );

    // -------------------------------------------------------------
    // PART 3: ATM CASH WITHDRAWAL & DOUBLE-ENTRY LEDGER
    // -------------------------------------------------------------
    console.log('\n--- PART 3: ATM Cash Withdrawal & Concurrency Protection ---');

    // Test 12: Withdrawal from Suspended account rejected
    const suspendedWithdraw = await request('/api/transactions/withdraw', {
      method: 'POST',
      token: tokenA,
      body: { accountId: suspendedAccountA._id.toString(), amount: 500, idempotencyKey: `SUSP_WTH_${timestamp}` },
    });
    assert(
      'Suspended account cash withdrawal rejected with 400',
      suspendedWithdraw.status === 400,
      `Expected 400, got ${suspendedWithdraw.status}`
    );

    // Test 13: Withdrawal Insufficient Funds rejection
    const overdrawRes = await request('/api/transactions/withdraw', {
      method: 'POST',
      token: tokenA,
      body: { accountId: accountA._id.toString(), amount: 10000, idempotencyKey: `OVERDRAW_${timestamp}` },
    });
    assert(
      'Withdrawal exceeding available balance (₹10,000 > ₹5,000) rejected with 400 Insufficient funds',
      overdrawRes.status === 400 && /insufficient/i.test(overdrawRes.data?.message || ''),
      `Expected 400 Insufficient funds, got ${overdrawRes.status} (${JSON.stringify(overdrawRes.data)})`
    );

    // Test 14: Successful ATM cash withdrawal
    const withdrawAmount = 2000;
    const wthIdempotencyKey = `WTH_TEST_${timestamp}_1`;
    const withdrawRes = await request('/api/transactions/withdraw', {
      method: 'POST',
      token: tokenA,
      body: {
        accountId: accountA._id.toString(),
        amount: withdrawAmount,
        description: 'ATM Terminal #12 Cash Withdrawal',
        idempotencyKey: wthIdempotencyKey,
      },
    });

    assert(
      'Successful cash withdrawal returns 201 Created',
      withdrawRes.status === 201 && withdrawRes.data?.success === true,
      `Expected 201, got ${withdrawRes.status} (${JSON.stringify(withdrawRes.data)})`
    );

    const txWithdrawId = withdrawRes.data?.transaction?._id;
    const withdrawTxDoc = await transactionModel.findById(txWithdrawId);

    assert(
      'Withdrawal transaction record created with status COMPLETED and valid accounts',
      withdrawTxDoc && withdrawTxDoc.status === 'COMPLETED' && withdrawTxDoc.fromAccount.toString() === accountA._id.toString(),
      `Withdrawal tx doc: ${JSON.stringify(withdrawTxDoc)}`
    );

    // Verify double-entry ledger entries for withdrawal
    const withdrawLedgerEntries = await ladgerModel.find({ transaction: withdrawTxDoc._id });
    assert(
      'Exactly 2 ledger entries created for withdrawal transaction',
      withdrawLedgerEntries.length === 2,
      `Found ${withdrawLedgerEntries.length} entries`
    );

    const custDebitEntry = withdrawLedgerEntries.find((e) => e.type === 'DEBIT');
    const vaultCreditEntry = withdrawLedgerEntries.find((e) => e.type === 'CREDIT');

    assert(
      'Withdrawal ledger: DEBIT Customer account and CREDIT Cash Vault account with exact amounts',
      custDebitEntry &&
        vaultCreditEntry &&
        custDebitEntry.amount === withdrawAmount &&
        vaultCreditEntry.amount === withdrawAmount &&
        custDebitEntry.account.toString() === accountA._id.toString() &&
        vaultCreditEntry.account.toString() === vaultAccount._id.toString(),
      `Customer debit: ${JSON.stringify(custDebitEntry)}, Vault credit: ${JSON.stringify(vaultCreditEntry)}`
    );

    // Test 15: Verify Alice's balance after withdrawal (5000 - 2000 = 3000)
    const postWithdrawBalA = await getDerivedBalance(accountA._id);
    assert(
      'Alice derived ledger balance updated from 5000 to 3000',
      postWithdrawBalA === 3000,
      `Expected 3000, got ${postWithdrawBalA}`
    );

    // Test 16: Withdrawal Idempotency replay
    const wthReplayRes = await request('/api/transactions/withdraw', {
      method: 'POST',
      token: tokenA,
      body: {
        accountId: accountA._id.toString(),
        amount: withdrawAmount,
        description: 'ATM Terminal #12 Cash Withdrawal',
        idempotencyKey: wthIdempotencyKey,
      },
    });

    assert(
      'Withdrawal Idempotency: Replaying request with same idempotencyKey returns 200/201 with identical tx ID',
      (wthReplayRes.status === 200 || wthReplayRes.status === 201) &&
        wthReplayRes.data?.transaction?._id === txWithdrawId,
      `Expected same tx ID ${txWithdrawId}, got ${wthReplayRes.status}`
    );

    const postWthReplayBalA = await getDerivedBalance(accountA._id);
    assert(
      'Withdrawal Idempotency: Alice balance remained exactly 3000 (no double debit)',
      postWthReplayBalA === 3000,
      `Expected 3000, got ${postWthReplayBalA}`
    );

    // Test 17: Audit log and notification recorded for withdrawal
    const withdrawAudit = await auditLogModel.findOne({
      resourceId: txWithdrawId.toString(),
      action: 'CASH_WITHDRAWAL',
    });
    assert(
      'Audit log recorded for cash withdrawal (action: CASH_WITHDRAWAL)',
      Boolean(withdrawAudit),
      `Withdrawal audit: ${JSON.stringify(withdrawAudit)}`
    );

    const withdrawNotif = await notificationModel.findOne({
      recipient: customerUserA._id,
      type: 'TRANSACTION_SENT',
      relatedResourceId: txWithdrawId.toString(),
    });
    assert(
      'In-app notification generated for cash withdrawal',
      Boolean(withdrawNotif),
      `Withdrawal notif: ${JSON.stringify(withdrawNotif)}`
    );

    const step10TxIds = [depositTxDoc._id, withdrawTxDoc._id];

    // -------------------------------------------------------------
    // PART 4: DOUBLE-ENTRY LEDGER CONSERVATION
    // -------------------------------------------------------------
    console.log('\n--- PART 4: Double-Entry Ledger Conservation ---');

    const step10Sum = await ladgerModel.aggregate([
      {
        $match: { transaction: { $in: step10TxIds } },
      },
      {
        $group: {
          _id: null,
          totalDebits: {
            $sum: { $cond: [{ $eq: ['$type', 'DEBIT'] }, '$amount', 0] },
          },
          totalCredits: {
            $sum: { $cond: [{ $eq: ['$type', 'CREDIT'] }, '$amount', 0] },
          },
        },
      },
    ]);

    const step10Debits = step10Sum[0]?.totalDebits || 0;
    const step10Credits = step10Sum[0]?.totalCredits || 0;

    assert(
      'Step 10 Transactions Double-Entry Balance: Total Debits == Total Credits exactly',
      step10Debits === step10Credits && step10Debits === (depositAmount + withdrawAmount),
      `Step 10 Debits: ${step10Debits}, Step 10 Credits: ${step10Credits}`
    );

    // -------------------------------------------------------------
    // PART 5: CONCURRENT WITHDRAWAL RACE CONDITION TEST
    // -------------------------------------------------------------
    console.log('\n--- PART 5: Concurrency & Race Condition Protection ---');

    // Balance is currently ₹3,000.
    // Launch 4 simultaneous withdrawal requests of ₹1,000 each.
    // Exactly 3 should succeed and 1 should fail with insufficient balance.
    const concurrentRequests = Array.from({ length: 4 }, (_, idx) =>
      request('/api/transactions/withdraw', {
        method: 'POST',
        token: tokenA,
        body: {
          accountId: accountA._id.toString(),
          amount: 1000,
          description: `Concurrent ATM withdrawal #${idx + 1}`,
          idempotencyKey: `CONCURRENT_WTH_${timestamp}_${idx + 1}`,
        },
      })
    );

    const concurrentResults = await Promise.all(concurrentRequests);
    const successResults = concurrentResults.filter((r) => r.status === 201 && (r.data?.success || r.data?.status === 'success'));
    const failureResults = concurrentResults.filter((r) => r.status === 400);

    for (const res of successResults) {
      if (res.data?.transaction?._id) {
        step10TxIds.push(new mongoose.Types.ObjectId(res.data.transaction._id));
      }
    }

    assert(
      'Concurrency: Exactly 3 out of 4 ₹1000 withdrawals succeeded against ₹3000 balance',
      successResults.length === 3,
      `Success count: ${successResults.length}, Failed count: ${failureResults.length}`
    );

    const finalBalA = await getDerivedBalance(accountA._id);
    assert(
      'Concurrency: Final Alice derived balance is exactly 0 and never went negative',
      finalBalA === 0,
      `Expected 0, got ${finalBalA}`
    );

    // Re-verify Double-Entry Ledger Equation after concurrent stress
    const postStressSum = await ladgerModel.aggregate([
      {
        $match: { transaction: { $in: step10TxIds } },
      },
      {
        $group: {
          _id: null,
          totalDebits: {
            $sum: { $cond: [{ $eq: ['$type', 'DEBIT'] }, '$amount', 0] },
          },
          totalCredits: {
            $sum: { $cond: [{ $eq: ['$type', 'CREDIT'] }, '$amount', 0] },
          },
        },
      },
    ]);

    const postDebits = postStressSum[0]?.totalDebits || 0;
    const postCredits = postStressSum[0]?.totalCredits || 0;

    assert(
      'Double-Entry Ledger Equation holds after concurrency test (Debits == Credits)',
      postDebits === postCredits && postDebits === (depositAmount + withdrawAmount + (successResults.length * 1000)),
      `Debits: ${postDebits}, Credits: ${postCredits}`
    );

    // Cleanup test data
    await userModel.deleteMany({ _id: { $in: [customerUserA._id, customerUserB._id] } });
    await accountModel.deleteMany({ _id: { $in: [accountA._id, accountB._id, suspendedAccountA._id, inactiveAccountA._id] } });
  } catch (err) {
    console.error('Fatal error during Step 10 test execution:', err);
    failedCount++;
  } finally {
    if (server) {
      server.close();
    }
    await mongoose.disconnect();
    console.log('Step 10 test suite finished and disconnected from MongoDB.');
  }

  console.log('\n==================================================');
  console.log(`STEP 10 TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('==================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests();

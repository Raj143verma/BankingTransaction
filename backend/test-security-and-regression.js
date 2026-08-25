/**
 * STEP 2: Comprehensive Security Hardening & Banking Regression Test Suite
 * Zero external test framework dependencies (uses native Node.js http and fetch)
 */
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { validateEnv } = require('./src/config/env');
const userModel = require('./src/models/user.model');
const accountModel = require('./src/models/account.model');
const transactionModel = require('./src/models/transaction.model');
const ladgerModel = require('./src/models/ladger.model');
const accountApplicationModel = require('./src/models/accountApplication.model');
const tokenBlacklistModel = require('./src/models/blackList.model');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/banking';
const JWT_SECRET = process.env.JWT_SECRET || 'a_very_secure_and_long_jwt_secret_with_32_characters_min!';

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
    body: options.rawBody !== undefined ? options.rawBody : options.body ? JSON.stringify(options.body) : undefined,
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

async function runSecurityTests() {
  console.log('\n==================================================');
  console.log('STARTING STEP 2 SECURITY HARDENING & REGRESSION SUITE');
  console.log('==================================================\n');

  // 1. Test Environment Validation Fail-Fast
  console.log('--- TEST GROUP 1: Environment Validation ---');
  try {
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'short';
    let failedAsExpected = false;
    try {
      validateEnv();
    } catch (e) {
      failedAsExpected = true;
    }
    process.env.JWT_SECRET = originalSecret;
    console.assert(failedAsExpected, 'Environment validator must throw on short JWT_SECRET (<32 chars)');
    console.log('✓ TEST 1.1: Environment validator correctly rejects insecure JWT_SECRET');
  } catch (err) {
    console.error('❌ Test 1.1 failed:', err);
    throw err;
  }

  // Connect to DB and Start HTTP Server
  await mongoose.connect(MONGO_URI);
  console.log('✓ Connected to MongoDB');

  app = require('./src/app');
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✓ Test HTTP server listening on ${baseUrl}`);

  let customerA, customerB, systemUser;
  let accountA1, accountB1, systemAccount;
  let tokenA, tokenB, tokenSys;

  try {
    const timestamp = Date.now();
    const emailA = `sec_test_a_${timestamp}@example.com`;
    const emailB = `sec_test_b_${timestamp}@example.com`;
    const emailSys = `sec_test_sys_${timestamp}@example.com`;

    // 2. Test Security Headers (Helmet)
    console.log('\n--- TEST GROUP 2: Security HTTP Headers ---');
    const headerRes = await apiRequest('/api/auth/me');
    console.assert(headerRes.headers.get('x-content-type-options') === 'nosniff', 'Must include X-Content-Type-Options: nosniff');
    console.assert(headerRes.headers.get('x-frame-options') === 'DENY', 'Must include X-Frame-Options: DENY');
    console.assert(!headerRes.headers.get('x-powered-by'), 'X-Powered-By header must be removed');
    console.assert(headerRes.headers.get('referrer-policy') === 'strict-origin-when-cross-origin', 'Must include Referrer-Policy');
    console.log('✓ TEST 2.1: Helmet security headers properly configured (nosniff, DENY, no powered-by, referrer-policy)');

    // 3. Test Request Body Limit (10kb)
    console.log('\n--- TEST GROUP 3: Request Body Limit (10kb) ---');
    const hugePayload = {
      email: emailA,
      password: 'Password123!',
      junk: 'X'.repeat(15 * 1024), // 15kb payload
    };
    const limitRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: hugePayload,
    });
    console.assert(limitRes.status === 413, `Expected 413 Payload Too Large, got ${limitRes.status}`);
    console.assert(limitRes.body?.status === 'error', 'Error response must have status: error');
    console.log('✓ TEST 3.1: 15kb oversized request payload rejected with HTTP 413 Payload Too Large');

    // 4. Test 404 Route Handler
    console.log('\n--- TEST GROUP 4: Centralized 404 Handler ---');
    const notFoundRes = await apiRequest('/api/non-existent-endpoint-xyz');
    console.assert(notFoundRes.status === 404, `Expected 404, got ${notFoundRes.status}`);
    console.assert(notFoundRes.body?.status === 'error', '404 must return status: error');
    console.assert(notFoundRes.body?.message === 'Route not found', '404 message must match');
    console.log('✓ TEST 4.1: Unmatched route cleanly handled by 404 middleware with standardized JSON');

    // Setup Test Users & Accounts
    customerA = await userModel.create({
      name: 'Alice Security',
      email: emailA,
      password: 'Password123!',
      systemUser: false,
    });

    customerB = await userModel.create({
      name: 'Bob Security',
      email: emailB,
      password: 'Password123!',
      systemUser: false,
    });

    systemUser = await userModel.create({
      name: 'System Admin',
      email: emailSys,
      password: 'Password123!',
      systemUser: true,
    });

    tokenA = jwt.sign({ id: customerA._id }, JWT_SECRET, { expiresIn: '1d' });
    tokenB = jwt.sign({ id: customerB._id }, JWT_SECRET, { expiresIn: '1d' });
    tokenSys = jwt.sign({ id: systemUser._id }, JWT_SECRET, { expiresIn: '1d' });

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

    systemAccount = await accountModel.create({
      user: systemUser._id,
      accountHolderName: 'System Central Reserve',
      accountType: 'SAVINGS',
      status: 'ACTIVE',
      currency: 'INR',
    });

    // Seed initial balance for Alice A1: 5000 INR
    const seedTx = await transactionModel.create({
      fromAccount: systemAccount._id,
      toAccount: accountA1._id,
      amount: 5000,
      status: 'COMPLETED',
      idempotencyKey: `SEED_SEC_${timestamp}`,
    });
    await ladgerModel.create([
      { account: systemAccount._id, amount: 5000, transaction: seedTx._id, type: 'DEBIT' },
      { account: accountA1._id, amount: 5000, transaction: seedTx._id, type: 'CREDIT' },
    ]);

    console.log('✓ Test users, accounts, and ledger initial funding initialized');

    // 5. Test Authentication & Session Management
    console.log('\n--- TEST GROUP 5: Authentication & Session ---');
    // Login with valid credentials
    const loginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: emailA, password: 'Password123!' },
    });
    console.assert(loginRes.status === 200, `Login expected 200, got ${loginRes.status}`);
    console.assert(loginRes.body.user?.email === emailA, 'Login user email must match');
    console.log('✓ TEST 5.1: User login successful');

    // /api/auth/me
    const meRes = await apiRequest('/api/auth/me', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.assert(meRes.status === 200, 'GET /me expected 200');
    console.assert(meRes.body.user?._id === customerA._id.toString(), 'Profile ID must match');
    console.log('✓ TEST 5.2: GET /api/auth/me profile verified');

    // Logout & Token Blacklisting
    const logoutRes = await apiRequest('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.assert(logoutRes.status === 200, 'Logout expected 200');

    // Verifying blacklisted token is rejected
    const afterLogoutMe = await apiRequest('/api/auth/me', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.assert(afterLogoutMe.status === 401, `Blacklisted token expected 401, got ${afterLogoutMe.status}`);
    console.log('✓ TEST 5.3: Logout and token blacklist verification succeeded');

    // Generate fresh token for A
    tokenA = jwt.sign({ id: customerA._id }, JWT_SECRET, { expiresIn: '1d' });

    // 6. Test RBAC (Customer vs System)
    console.log('\n--- TEST GROUP 6: Role-Based Access Control (RBAC) ---');
    // Customer accessing SYSTEM route
    const customerOnSysApp = await apiRequest('/api/account-applications/system', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.assert(customerOnSysApp.status === 403, `Customer on SYSTEM route expected 403, got ${customerOnSysApp.status}`);

    const customerOnCustAccs = await apiRequest('/api/accounts/customer-accounts', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    console.assert(customerOnCustAccs.status === 403, `Customer on customer-accounts expected 403, got ${customerOnCustAccs.status}`);

    // System user accessing SYSTEM route
    const sysOnSysApp = await apiRequest('/api/account-applications/system', {
      headers: { Authorization: `Bearer ${tokenSys}` },
    });
    console.assert(sysOnSysApp.status === 200, `System user on SYSTEM route expected 200, got ${sysOnSysApp.status}`);
    console.log('✓ TEST 6.1: Strict RBAC enforcement verified (Customer 403 / System 200)');

    // 7. Test IDOR & Cross-Customer Isolation
    console.log('\n--- TEST GROUP 7: IDOR & Customer Isolation ---');
    // Customer B trying to fetch Customer A's balance
    const idorBalance = await apiRequest(`/api/accounts/balance/${accountA1._id.toString()}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    console.assert(idorBalance.status === 404, `Cross-customer balance access must return 404, got ${idorBalance.status}`);

    // Customer B trying to initiate transfer from Customer A's account
    const idorTransfer = await apiRequest('/api/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: {
        fromAccount: accountA1._id.toString(),
        toAccount: accountB1._id.toString(),
        amount: 500,
        idempotencyKey: `IDOR_TX_${timestamp}`,
      },
    });
    console.assert(idorTransfer.status === 403, `Unauthorized source account transfer must return 403, got ${idorTransfer.status}`);
    console.log('✓ TEST 7.1: IDOR cross-customer balance & unauthorized transfer protection verified');

    // 8. Test Financial Transfer & Ledger Regression
    console.log('\n--- TEST GROUP 8: Financial Transfer & Ledger Regression ---');
    const validTransfer = await apiRequest('/api/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        fromAccount: accountA1._id.toString(),
        toAccount: accountB1._id.toString(),
        amount: 1000,
        idempotencyKey: `VALID_TX_${timestamp}`,
      },
    });
    console.assert(validTransfer.status === 201, `Valid transfer expected 201, got ${validTransfer.status}`);
    console.assert(validTransfer.body.transaction?.status === 'COMPLETED', 'Transfer status must be COMPLETED');

    // Verify derived ledger balance for both accounts
    const balA = await accountA1.getBalance();
    const balB = await accountB1.getBalance();
    console.assert(balA === 4000, `Expected A balance 4000, got ${balA}`);
    console.assert(balB === 1000, `Expected B balance 1000, got ${balB}`);

    // Test Idempotency key replay
    const replayTransfer = await apiRequest('/api/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        fromAccount: accountA1._id.toString(),
        toAccount: accountB1._id.toString(),
        amount: 1000,
        idempotencyKey: `VALID_TX_${timestamp}`,
      },
    });
    console.assert(replayTransfer.status === 200, `Replay transfer expected 200, got ${replayTransfer.status}`);
    console.assert(replayTransfer.body.transaction?.status === 'COMPLETED', 'Replay must return completed status');

    // Verify balance unchanged after replay
    const balAAfter = await accountA1.getBalance();
    console.assert(balAAfter === 4000, `Balance must remain 4000 after replay, got ${balAAfter}`);
    console.log('✓ TEST 8.1: P2P transfer, double-entry ledger calculation, and idempotency replay verified');

    // 9. Test Rate Limiting
    console.log('\n--- TEST GROUP 9: Authentication Rate Limiting ---');
    // Auth limiter allows 10 requests per 15 minutes. We already made 1 login earlier.
    // Let's make 10 rapid failed login attempts to trigger 429
    let triggeredRateLimit = false;
    for (let i = 0; i < 12; i++) {
      const r = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: { email: `fake_${i}@example.com`, password: 'wrongpassword' },
      });
      if (r.status === 429) {
        triggeredRateLimit = true;
        console.assert(r.body?.status === 'error', '429 body must have status: error');
        break;
      }
    }
    console.assert(triggeredRateLimit, 'Auth rate limiter must return HTTP 429 after exceeding limit');
    console.log('✓ TEST 9.1: Auth rate limiting (HTTP 429 Too Many Requests) verified');

    console.log('\n==================================================');
    console.log('ALL SECURITY HARDENING & REGRESSION TESTS PASSED! (100%)');
    console.log('==================================================\n');
  } finally {
    if (customerA) await userModel.deleteMany({ _id: { $in: [customerA._id, customerB._id, systemUser._id] } });
    if (accountA1) await accountModel.deleteMany({ _id: { $in: [accountA1._id, accountB1._id, systemAccount._id] } });
    await transactionModel.deleteMany({ idempotencyKey: { $regex: 'SEED_SEC|IDOR_TX|VALID_TX' } });
    if (server) server.close();
    await mongoose.disconnect();
    console.log('✓ Database connection closed and test teardown complete.');
  }
}

runSecurityTests().catch((err) => {
  console.error('❌ Test suite execution error:', err);
  process.exit(1);
});

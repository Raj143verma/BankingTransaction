require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('./src/app');

const userModel = require('./src/models/user.model');
const accountModel = require('./src/models/account.model');
const ladgerModel = require('./src/models/ladger.model');
const transactionModel = require('./src/models/transaction.model');
const accountApplicationModel = require('./src/models/accountApplication.model');
const auditLogModel = require('./src/models/auditLog.model');
const notificationModel = require('./src/models/notification.model');
const notificationService = require('./src/services/notification.service');

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

async function runTests() {
  console.log('\n==================================================');
  console.log('STARTING STEP 8 NOTIFICATIONS & SECURITY SUITE');
  console.log('==================================================\n');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB for Step 8 test suite');

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Test server running at ${baseUrl}\n`);

  let testCount = 0;
  let passCount = 0;

  try {
    // 0. Setup test users and data
    const timestamp = Date.now();

    // Clean any prior test artifacts for this run
    await notificationModel.deleteMany({ 'title': /TestNotif|Step8/ });

    // Customer A
    const userA = await userModel.create({
      email: `customer.a.${timestamp}@testbank.com`,
      name: 'Alice Customer',
      password: 'Password123!',
      sessionVersion: 1,
      systemUser: false,
    });
    const tokenA = jwt.sign({ id: userA._id, sessionVersion: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Customer B
    const userB = await userModel.create({
      email: `customer.b.${timestamp}@testbank.com`,
      name: 'Bob Customer',
      password: 'Password123!',
      sessionVersion: 1,
      systemUser: false,
    });
    const tokenB = jwt.sign({ id: userB._id, sessionVersion: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // System Admin User
    const systemAdmin = await userModel.create({
      email: `sysadmin.${timestamp}@testbank.com`,
      name: 'System Administrator',
      password: 'Password123!',
      sessionVersion: 1,
      systemUser: true,
    });
    const tokenSys = jwt.sign({ id: systemAdmin._id, sessionVersion: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Accounts
    const accA = await accountModel.create({
      user: userA._id,
      accountHolderName: 'Alice Customer',
      accountType: 'SAVINGS',
      currency: 'INR',
      status: 'ACTIVE',
    });

    const accB = await accountModel.create({
      user: userB._id,
      accountHolderName: 'Bob Customer',
      accountType: 'SAVINGS',
      currency: 'INR',
      status: 'ACTIVE',
    });

    const accSys = await accountModel.create({
      user: systemAdmin._id,
      accountHolderName: 'System Reserve',
      accountType: 'CURRENT',
      currency: 'INR',
      status: 'ACTIVE',
    });

    // Seed ledger with initial funds for Alice (10,000 INR)
    const seedTx = await transactionModel.create({
      fromAccount: accSys._id,
      toAccount: accA._id,
      amount: 10000,
      idempotencyKey: `SEED_STEP8_${timestamp}`,
      status: 'COMPLETED',
    });
    await ladgerModel.create([
      { account: accSys._id, amount: 10000, transaction: seedTx._id, type: 'DEBIT' },
      { account: accA._id, amount: 10000, transaction: seedTx._id, type: 'CREDIT' },
    ]);

    // -------------------------------------------------------------
    // TEST 1: Unauthenticated request -> 401
    // -------------------------------------------------------------
    testCount++;
    const res1 = await request('/api/notifications');
    const p1 = res1.status === 401;
    if (p1) passCount++;
    logTest(testCount, 'Unauthenticated notification access returns 401', p1, JSON.stringify(res1.data));

    // -------------------------------------------------------------
    // TEST 2: User A retrieves own notifications (initially empty)
    // -------------------------------------------------------------
    testCount++;
    const res2 = await request('/api/notifications', { token: tokenA });
    const p2 = res2.status === 200 && Array.isArray(res2.data.notifications) && res2.data.pagination.totalCount === 0;
    if (p2) passCount++;
    logTest(testCount, 'Authenticated user can retrieve empty notification list', p2, JSON.stringify(res2.data));

    // Seed 3 notifications for User A and 2 for User B
    const notifA1 = await notificationService.createNotification({
      recipient: userA._id,
      type: 'SECURITY_LOGIN',
      title: 'TestNotif A1: Login',
      message: 'You logged in successfully',
      severity: 'INFO',
    });

    const notifA2 = await notificationService.createNotification({
      recipient: userA._id,
      type: 'TRANSACTION_RECEIVED',
      title: 'TestNotif A2: Money Received',
      message: '₹100 credited',
      severity: 'SUCCESS',
    });

    const notifA3 = await notificationService.createNotification({
      recipient: userA._id,
      type: 'SECURITY_LOGIN_FAILED',
      title: 'TestNotif A3: Failed Login',
      message: 'Failed password attempt',
      severity: 'WARNING',
    });

    const notifB1 = await notificationService.createNotification({
      recipient: userB._id,
      type: 'SECURITY_LOGIN',
      title: 'TestNotif B1: Login for Bob',
      message: 'Bob logged in',
      severity: 'INFO',
    });

    // -------------------------------------------------------------
    // TEST 3: IDOR Protection: User A only retrieves User A's notifications
    // -------------------------------------------------------------
    testCount++;
    const res3 = await request('/api/notifications', { token: tokenA });
    const userANotifIds = (res3.data.notifications || []).map((n) => n._id);
    const p3 =
      res3.status === 200 &&
      userANotifIds.length === 3 &&
      userANotifIds.includes(notifA1._id.toString()) &&
      !userANotifIds.includes(notifB1._id.toString());
    if (p3) passCount++;
    logTest(testCount, 'IDOR Protection: User A only receives their own notifications', p3, JSON.stringify(res3.data));

    // -------------------------------------------------------------
    // TEST 4: Pagination works (limit=2, page=1 and page=2)
    // -------------------------------------------------------------
    testCount++;
    const res4Page1 = await request('/api/notifications?page=1&limit=2', { token: tokenA });
    const res4Page2 = await request('/api/notifications?page=2&limit=2', { token: tokenA });
    const p4 =
      res4Page1.status === 200 &&
      res4Page1.data.notifications.length === 2 &&
      res4Page1.data.pagination.totalPages === 2 &&
      res4Page1.data.pagination.totalCount === 3 &&
      res4Page2.status === 200 &&
      res4Page2.data.notifications.length === 1;
    if (p4) passCount++;
    logTest(testCount, 'Pagination limits and page offsets correctly calculated', p4, JSON.stringify(res4Page1.data));

    // -------------------------------------------------------------
    // TEST 5: Unread count endpoint
    // -------------------------------------------------------------
    testCount++;
    const res5 = await request('/api/notifications/unread-count', { token: tokenA });
    const p5 = res5.status === 200 && res5.data.count === 3;
    if (p5) passCount++;
    logTest(testCount, 'Unread count endpoint returns accurate count (3 unread)', p5, JSON.stringify(res5.data));

    // -------------------------------------------------------------
    // TEST 6: Mark single notification as read
    // -------------------------------------------------------------
    testCount++;
    const res6 = await request(`/api/notifications/${notifA1._id}/read`, { method: 'PATCH', token: tokenA });
    const res6Count = await request('/api/notifications/unread-count', { token: tokenA });
    const p6 = res6.status === 200 && res6.data.notification.isRead === true && res6Count.data.count === 2;
    if (p6) passCount++;
    logTest(testCount, 'Mark single notification as read updates state and unread count', p6, JSON.stringify(res6.data));

    // -------------------------------------------------------------
    // TEST 7: Filtering by isRead (unread vs read)
    // -------------------------------------------------------------
    testCount++;
    const res7Unread = await request('/api/notifications?isRead=false', { token: tokenA });
    const res7Read = await request('/api/notifications?isRead=true', { token: tokenA });
    const p7 =
      res7Unread.status === 200 &&
      res7Unread.data.notifications.length === 2 &&
      res7Read.status === 200 &&
      res7Read.data.notifications.length === 1;
    if (p7) passCount++;
    logTest(testCount, 'Filtering by isRead state correctly separates read and unread items', p7);

    // -------------------------------------------------------------
    // TEST 8: IDOR Protection: User B cannot mark User A's notification as read
    // -------------------------------------------------------------
    testCount++;
    const res8 = await request(`/api/notifications/${notifA2._id}/read`, { method: 'PATCH', token: tokenB });
    const p8 = res8.status === 404; // User B cannot mutate User A's notification
    if (p8) passCount++;
    logTest(testCount, "IDOR Protection: User B cannot modify User A's notification (404 Not Found)", p8, JSON.stringify(res8.data));

    // -------------------------------------------------------------
    // TEST 9: Invalid ObjectId handling -> 400 Bad Request
    // -------------------------------------------------------------
    testCount++;
    const res9 = await request('/api/notifications/invalid-object-id/read', { method: 'PATCH', token: tokenA });
    const p9 = res9.status === 400;
    if (p9) passCount++;
    logTest(testCount, 'Malformed notification ID returns 400 Bad Request', p9, JSON.stringify(res9.data));

    // -------------------------------------------------------------
    // TEST 10: Mark all notifications as read
    // -------------------------------------------------------------
    testCount++;
    const res10 = await request('/api/notifications/read-all', { method: 'PATCH', token: tokenA });
    const res10Count = await request('/api/notifications/unread-count', { token: tokenA });
    const p10 = res10.status === 200 && res10.data.modifiedCount === 2 && res10Count.data.count === 0;
    if (p10) passCount++;
    logTest(testCount, 'Mark all notifications as read successfully clears all unread items', p10, JSON.stringify(res10.data));

    // -------------------------------------------------------------
    // TEST 11: Transaction creation generates notifications for sender and receiver
    // -------------------------------------------------------------
    testCount++;
    const prevNotifCountA = (await notificationModel.find({ recipient: userA._id })).length;
    const prevNotifCountB = (await notificationModel.find({ recipient: userB._id })).length;

    const txRes = await request('/api/transactions', {
      method: 'POST',
      token: tokenA,
      body: {
        fromAccount: accA._id,
        toAccount: accB._id,
        amount: 500,
        idempotencyKey: `TX_NOTIF_TEST_${timestamp}`,
      },
    });

    const newNotifsA = await notificationModel.find({ recipient: userA._id, type: 'TRANSACTION_SENT' });
    const newNotifsB = await notificationModel.find({ recipient: userB._id, type: 'TRANSACTION_RECEIVED' });

    const p11 =
      txRes.status === 201 &&
      newNotifsA.length > 0 &&
      newNotifsB.length > 0 &&
      newNotifsA[newNotifsA.length - 1].metadata.amount === 500 &&
      newNotifsB[newNotifsB.length - 1].metadata.amount === 500;
    if (p11) passCount++;
    logTest(testCount, 'P2P Transfer emits TRANSACTION_SENT to sender and TRANSACTION_RECEIVED to receiver', p11, JSON.stringify(txRes.data));

    // -------------------------------------------------------------
    // TEST 12: Transaction Reversal generates notifications for both parties
    // -------------------------------------------------------------
    testCount++;
    const createdTxId = txRes.data.transaction._id;
    const revRes = await request(`/api/transactions/${createdTxId}/reverse`, {
      method: 'POST',
      token: tokenSys,
      body: {
        reason: 'Step 8 Reversal Notification Test Verification',
      },
    });

    const revNotifsA = await notificationModel.find({
      recipient: userA._id,
      type: 'TRANSACTION_REVERSED',
      relatedResourceId: createdTxId,
    });
    const revNotifsB = await notificationModel.find({
      recipient: userB._id,
      type: 'TRANSACTION_REVERSED',
      relatedResourceId: createdTxId,
    });

    const p12 = revRes.status === 200 && revNotifsA.length === 1 && revNotifsB.length === 1;
    if (p12) passCount++;
    logTest(testCount, 'Transaction Reversal emits TRANSACTION_REVERSED notifications to both sender and receiver', p12, JSON.stringify(revRes.data));

    // -------------------------------------------------------------
    // TEST 13: Account Lifecycle updates emit notifications
    // -------------------------------------------------------------
    testCount++;
    // Suspend Alice's account
    const suspRes = await request(`/api/accounts/${accA._id}/status`, {
      method: 'PATCH',
      token: tokenSys,
      body: {
        status: 'SUSPENDED',
        reason: 'Temporary regulatory suspension test',
      },
    });

    const suspNotif = await notificationModel.findOne({
      recipient: userA._id,
      type: 'ACCOUNT_SUSPENDED',
      relatedResourceId: accA._id,
    });

    // Reactivate Alice's account
    const reactRes = await request(`/api/accounts/${accA._id}/status`, {
      method: 'PATCH',
      token: tokenSys,
      body: {
        status: 'ACTIVE',
        reason: 'Compliance documentation verified',
      },
    });

    const reactNotif = await notificationModel.findOne({
      recipient: userA._id,
      type: 'ACCOUNT_REACTIVATED',
      relatedResourceId: accA._id,
    });

    const p13 = suspRes.status === 200 && reactRes.status === 200 && suspNotif !== null && reactNotif !== null;
    if (p13) passCount++;
    logTest(testCount, 'Account suspension & reactivation emit ACCOUNT_SUSPENDED and ACCOUNT_REACTIVATED', p13);

    // -------------------------------------------------------------
    // TEST 14: Application Approval and Rejection emit notifications
    // -------------------------------------------------------------
    testCount++;
    // Create Application 1 for User A (to be approved)
    const appRes1 = await request('/api/account-applications', {
      method: 'POST',
      token: tokenA,
      body: {
        fullName: 'Alice Customer',
        dateOfBirth: '1995-05-15',
        gender: 'FEMALE',
        mobileNumber: '9876543210',
        email: userA.email,
        address: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        pinCode: '400001',
        idType: 'AADHAAR',
        idNumber: '123456789012',
        accountType: 'SAVINGS',
        initialDeposit: 1000,
        confirmAccuracy: true,
        agreeTerms: true,
      },
    });

    const appId1 = appRes1.data.application._id;
    const approveRes = await request(`/api/account-applications/system/${appId1}/approve`, {
      method: 'POST',
      token: tokenSys,
    });

    const approveNotif = await notificationModel.findOne({
      recipient: userA._id,
      type: 'APPLICATION_APPROVED',
      relatedResourceId: appId1,
    });

    // Create Application 2 for User B (to be rejected)
    const appRes2 = await request('/api/account-applications', {
      method: 'POST',
      token: tokenB,
      body: {
        fullName: 'Bob Customer',
        dateOfBirth: '1992-08-20',
        gender: 'MALE',
        mobileNumber: '9123456789',
        email: userB.email,
        address: '456 Commercial Avenue',
        city: 'Delhi',
        state: 'Delhi',
        pinCode: '110001',
        idType: 'PAN',
        idNumber: 'ABCDE1234F',
        accountType: 'SAVINGS',
        initialDeposit: 500,
        confirmAccuracy: true,
        agreeTerms: true,
      },
    });

    const appId2 = appRes2.data.application._id;
    const rejectRes = await request(`/api/account-applications/system/${appId2}/reject`, {
      method: 'POST',
      token: tokenSys,
      body: {
        rejectionReason: 'Identity document image unreadable',
      },
    });

    const rejectNotif = await notificationModel.findOne({
      recipient: userB._id,
      type: 'APPLICATION_REJECTED',
      relatedResourceId: appId2,
    });

    const p14 =
      approveRes.status === 200 &&
      rejectRes.status === 200 &&
      approveNotif !== null &&
      rejectNotif !== null &&
      approveNotif.severity === 'SUCCESS' &&
      rejectNotif.severity === 'ERROR';
    if (p14) passCount++;
    logTest(testCount, 'Application approval and rejection emit APPLICATION_APPROVED and APPLICATION_REJECTED', p14);

    // -------------------------------------------------------------
    // TEST 15: Security Events (Login, Failed Login, Lockout, Password Change, Session Revocation)
    // -------------------------------------------------------------
    testCount++;
    // Successful login
    await request('/api/auth/login', {
      method: 'POST',
      body: { email: userA.email, password: 'Password123!' },
    });
    const loginNotif = await notificationModel.findOne({
      recipient: userA._id,
      type: 'SECURITY_LOGIN',
    }).sort({ createdAt: -1 });

    // Failed login
    await request('/api/auth/login', {
      method: 'POST',
      body: { email: userA.email, password: 'WrongPassword123!' },
    });
    const failedLoginNotif = await notificationModel.findOne({
      recipient: userA._id,
      type: 'SECURITY_LOGIN_FAILED',
    }).sort({ createdAt: -1 });

    // Password change
    await request('/api/auth/change-password', {
      method: 'POST',
      token: tokenA,
      body: {
        currentPassword: 'Password123!',
        newPassword: 'NewSecurePassword123!',
        confirmPassword: 'NewSecurePassword123!',
      },
    });
    const pwdNotif = await notificationModel.findOne({
      recipient: userA._id,
      type: 'SECURITY_PASSWORD_CHANGED',
    }).sort({ createdAt: -1 });

    // Re-login with new password for User A to get fresh token
    const freshLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: userA.email, password: 'NewSecurePassword123!' },
    });
    const freshTokenA = freshLogin.data.token;

    // Session revocation
    const revokeRes = await request('/api/auth/revoke-sessions', {
      method: 'POST',
      token: freshTokenA,
    });
    const currentTokenA = revokeRes.data.token;
    const revokeNotif = await notificationModel.findOne({
      recipient: userA._id,
      type: 'SECURITY_SESSIONS_REVOKED',
    }).sort({ createdAt: -1 });

    const p15 = loginNotif !== null && failedLoginNotif !== null && pwdNotif !== null && revokeNotif !== null;
    if (p15) passCount++;
    logTest(testCount, 'Security events emit SECURITY_LOGIN, SECURITY_LOGIN_FAILED, PASSWORD_CHANGED, and SESSIONS_REVOKED', p15);

    // -------------------------------------------------------------
    // TEST 16: Security: Notification payload metadata never leaks credentials/secrets
    // -------------------------------------------------------------
    testCount++;
    const testSecretNotif = await notificationService.createNotification({
      recipient: userA._id,
      type: 'SYSTEM_NOTICE',
      title: 'Secret Sanitization Test',
      message: 'Testing metadata sanitizer',
      metadata: {
        password: 'SuperSecretPassword!',
        token: 'ey123456.jwt.token',
        jwt: 'secret-token',
        authorization: 'Bearer token123',
        safeKey: 'SafePublicValue',
      },
    });

    const p16 =
      testSecretNotif.metadata.password === undefined &&
      testSecretNotif.metadata.token === undefined &&
      testSecretNotif.metadata.jwt === undefined &&
      testSecretNotif.metadata.safeKey === 'SafePublicValue';
    if (p16) passCount++;
    logTest(testCount, 'Metadata sanitization strips sensitive keys (password, token, jwt, authorization)', p16);

    // -------------------------------------------------------------
    // TEST 17: Immutability Guard: Modifying historical notification content is rejected
    // -------------------------------------------------------------
    testCount++;
    let immutabilityBlocked = false;
    try {
      await notificationModel.updateOne(
        { _id: testSecretNotif._id },
        { $set: { title: 'Tampered Title Attempt' } }
      );
    } catch (err) {
      immutabilityBlocked = err.message.includes('immutable');
    }
    const p17 = immutabilityBlocked === true;
    if (p17) passCount++;
    logTest(testCount, 'Historical immutability guard rejects modifying core notification fields', p17);

    // -------------------------------------------------------------
    // TEST 18: Maximum pagination limit clamped to 100
    // -------------------------------------------------------------
    testCount++;
    const res18 = await request('/api/notifications?limit=500', { token: tokenB });
    const p18 = res18.status === 200 && res18.data.pagination.limit === 100;
    if (p18) passCount++;
    logTest(testCount, 'Excessive page size clamped to maximum allowed limit (100)', p18, JSON.stringify(res18.data.pagination));

    // -------------------------------------------------------------
    // TEST 19: Delete notification endpoint with IDOR enforcement
    // -------------------------------------------------------------
    testCount++;
    // User B tries to delete User A's notification -> 404
    const res19Idor = await request(`/api/notifications/${testSecretNotif._id}`, { method: 'DELETE', token: tokenB });
    // User A deletes own notification -> 200
    const res19Own = await request(`/api/notifications/${testSecretNotif._id}`, { method: 'DELETE', token: currentTokenA });
    const checkDeleted = await notificationModel.findById(testSecretNotif._id);

    const p19 = res19Idor.status === 404 && res19Own.status === 200 && checkDeleted === null;
    if (p19) passCount++;
    logTest(testCount, 'Delete notification endpoint strictly enforces user ownership (IDOR protected)', p19);

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n==================================================');
    console.log(`STEP 8 NOTIFICATIONS & SECURITY RESULTS: ${passCount}/${testCount} PASSED (${Math.round((passCount / testCount) * 100)}%)`);
    console.log('==================================================\n');

    if (passCount !== testCount) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await mongoose.disconnect();
    console.log('Test server closed and disconnected from MongoDB');
  }
}

runTests();

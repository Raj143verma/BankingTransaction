/**
 * Integration Test Suite for STEP 5:
 * "Audit Logging & System Action Trail"
 * Uses native Node.js fetch and http server (zero external test dependencies)
 */
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const userModel = require('./src/models/user.model');
const accountModel = require('./src/models/account.model');
const accountApplicationModel = require('./src/models/accountApplication.model');
const transactionModel = require('./src/models/transaction.model');
const ladgerModel = require('./src/models/ladger.model');
const auditLogModel = require('./src/models/auditLog.model');

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

async function runStep5Tests() {
  console.log('\n==================================================');
  console.log('STARTING STEP 5 AUDIT LOGGING INTEGRATION TEST SUITE');
  console.log('==================================================\n');

  let passedAssertions = 0;
  let totalAssertions = 0;

  function assert(condition, message) {
    totalAssertions++;
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passedAssertions++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // Connect to MongoDB
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
      console.log('Connected to MongoDB for Step 5 test suite');
    }

    // Load Express app
    app = require('./src/app');
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    console.log(`Test server running at ${baseUrl}\n`);

    const runId = Date.now();

    // 1. Setup Test Users
    console.log('--- Phase 1: Setup System Admin & Customer Accounts ---');
    const systemUser = await userModel.create({
      email: `sysadmin_${runId}@bank.com`,
      name: 'System Auditor Admin',
      password: 'StrongPassword123!',
      systemUser: true,
    });

    const customerUser = await userModel.create({
      email: `customer_${runId}@bank.com`,
      name: 'Audit Test Customer',
      password: 'StrongPassword123!',
      systemUser: false,
    });

    const sysToken = jwt.sign({ id: systemUser._id }, JWT_SECRET, { expiresIn: '1h' });
    const custToken = jwt.sign({ id: customerUser._id }, JWT_SECRET, { expiresIn: '1h' });

    assert(systemUser.systemUser === true, 'System user created with systemUser=true');
    assert(customerUser.systemUser === false, 'Customer user created with systemUser=false');

    // 2. Audit Model Immutability Guard Tests
    console.log('\n--- Phase 2: AuditLog Schema Immutability Guards ---');
    const rawAuditLog = await auditLogModel.create({
      actor: systemUser._id,
      action: 'SYSTEM_FUNDS_INITIALIZED',
      resourceType: 'SYSTEM',
      reason: 'Testing immutability hooks',
    });

    assert(Boolean(rawAuditLog._id), 'AuditLog document created successfully');

    let updateBlocked = false;
    try {
      await auditLogModel.updateOne({ _id: rawAuditLog._id }, { $set: { reason: 'Tampered reason' } });
    } catch (err) {
      updateBlocked = err.message.includes('immutable');
    }
    assert(updateBlocked, 'AuditLog.updateOne() is blocked by immutability pre-hook');

    let deleteBlocked = false;
    try {
      await auditLogModel.deleteOne({ _id: rawAuditLog._id });
    } catch (err) {
      deleteBlocked = err.message.includes('immutable');
    }
    assert(deleteBlocked, 'AuditLog.deleteOne() is blocked by immutability pre-hook');

    // 3. API Authorization & RBAC
    console.log('\n--- Phase 3: Audit Log API Security & RBAC ---');
    const unauthRes = await apiRequest('/api/audit-logs');
    assert(unauthRes.status === 401, 'Unauthenticated GET /api/audit-logs returns 401 Unauthorized');

    const customerRes = await apiRequest('/api/audit-logs', {
      headers: { Authorization: `Bearer ${custToken}` },
    });
    if (customerRes.status !== 403) {
      console.log('CustomerRes status:', customerRes.status, 'body:', customerRes.body);
    }
    assert(customerRes.status === 403, 'Customer GET /api/audit-logs returns 403 Forbidden');

    const systemRes = await apiRequest('/api/audit-logs', {
      headers: { Authorization: `Bearer ${sysToken}` },
    });
    assert(systemRes.status === 200, 'System user GET /api/audit-logs returns 200 OK');
    assert(Array.isArray(systemRes.body?.auditLogs), 'System user response contains auditLogs array');
    assert(Boolean(systemRes.body?.pagination), 'System user response contains pagination metadata');

    // Verify client cannot directly create audit entries via POST
    const fakeCreateRes = await apiRequest('/api/audit-logs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sysToken}` },
      body: { action: 'FAKED_ACTION', reason: 'Attempting client injection' },
    });
    assert(fakeCreateRes.status === 404, 'POST /api/audit-logs returns 404 (No client creation endpoint)');

    // 4. System User Login & Logout Audit Trails
    console.log('\n--- Phase 4: Authentication Action Audit Logging ---');
    const loginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: systemUser.email,
        password: 'StrongPassword123!',
      },
    });
    assert(loginRes.status === 200, 'System user logged in successfully');

    const loginAudit = await auditLogModel.findOne({
      actor: systemUser._id,
      action: 'SYSTEM_LOGIN',
    }).sort({ createdAt: -1 });

    assert(Boolean(loginAudit), 'SYSTEM_LOGIN audit event recorded for system user');
    assert(loginAudit?.resourceType === 'USER', 'SYSTEM_LOGIN resourceType is USER');
    assert(String(loginAudit?.resourceId) === String(systemUser._id), 'SYSTEM_LOGIN resourceId is systemUser._id');

    // Customer login should NOT create audit log
    const custLoginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: customerUser.email,
        password: 'StrongPassword123!',
      },
    });
    assert(custLoginRes.status === 200, 'Customer logged in successfully');

    const custLoginAudit = await auditLogModel.findOne({
      actor: customerUser._id,
      action: 'SYSTEM_LOGIN',
    });
    assert(!custLoginAudit, 'Customer login does NOT generate SYSTEM_LOGIN audit log');

    // System logout audit (using dedicated token so sysToken remains active)
    const logoutToken = jwt.sign({ id: systemUser._id }, JWT_SECRET, { expiresIn: '1h' });
    const logoutRes = await apiRequest('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${logoutToken}` },
    });
    assert(logoutRes.status === 200, 'System user logged out successfully');

    const logoutAudit = await auditLogModel.findOne({
      actor: systemUser._id,
      action: 'SYSTEM_LOGOUT',
    }).sort({ createdAt: -1 });
    assert(Boolean(logoutAudit), 'SYSTEM_LOGOUT audit event recorded for system user');

    // 5. Account Lifecycle State Change Auditing
    console.log('\n--- Phase 5: Account Lifecycle State Change Audit Logging ---');
    const custAccount = await accountModel.create({
      user: customerUser._id,
      accountHolderName: 'Customer Audit Account',
      accountType: 'SAVINGS',
      status: 'ACTIVE',
      currency: 'INR',
    });

    // Suspend account
    const suspendReason = 'Suspicious velocity detected by fraud engine';
    const suspendRes = await apiRequest(`/api/accounts/${custAccount._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sysToken}` },
      body: {
        status: 'SUSPENDED',
        reason: suspendReason,
      },
    });
    assert(suspendRes.status === 200, 'Account suspended successfully by system admin');

    const suspendAudit = await auditLogModel.findOne({
      resourceId: custAccount._id,
      action: 'ACCOUNT_SUSPENDED',
    }).sort({ createdAt: -1 });

    assert(Boolean(suspendAudit), 'ACCOUNT_SUSPENDED audit event recorded');
    assert(String(suspendAudit?.actor) === String(systemUser._id), 'ACCOUNT_SUSPENDED actor is system user');
    assert(suspendAudit?.previousState?.status === 'ACTIVE', 'Previous state is ACTIVE');
    assert(suspendAudit?.newState?.status === 'SUSPENDED', 'New state is SUSPENDED');
    assert(suspendAudit?.reason === suspendReason, 'Reason matches submitted justification');

    // Reactivate account
    const reactivateReason = 'Compliance investigation resolved without violation';
    const reactivateRes = await apiRequest(`/api/accounts/${custAccount._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sysToken}` },
      body: {
        status: 'ACTIVE',
        reason: reactivateReason,
      },
    });
    assert(reactivateRes.status === 200, 'Account reactivated successfully by system admin');

    const reactivateAudit = await auditLogModel.findOne({
      resourceId: custAccount._id,
      action: 'ACCOUNT_REACTIVATED',
    }).sort({ createdAt: -1 });

    assert(Boolean(reactivateAudit), 'ACCOUNT_REACTIVATED audit event recorded');
    assert(reactivateAudit?.previousState?.status === 'SUSPENDED', 'Previous state is SUSPENDED');
    assert(reactivateAudit?.newState?.status === 'ACTIVE', 'New state is ACTIVE');

    // Deactivate account to INACTIVE
    const deactivateReason = 'Customer requested account closure';
    const deactivateRes = await apiRequest(`/api/accounts/${custAccount._id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sysToken}` },
      body: {
        status: 'INACTIVE',
        reason: deactivateReason,
      },
    });
    assert(deactivateRes.status === 200, 'Account deactivated successfully by system admin');

    const deactivateAudit = await auditLogModel.findOne({
      resourceId: custAccount._id,
      action: 'ACCOUNT_DEACTIVATED',
    }).sort({ createdAt: -1 });

    assert(Boolean(deactivateAudit), 'ACCOUNT_DEACTIVATED audit event recorded');
    assert(deactivateAudit?.previousState?.status === 'ACTIVE', 'Previous state is ACTIVE');
    assert(deactivateAudit?.newState?.status === 'INACTIVE', 'New state is INACTIVE');

    // 6. Application Review Auditing (Approval & Rejection)
    console.log('\n--- Phase 6: Account Application Review Audit Logging ---');
    // Test Application Approval
    const appToApprove = await accountApplicationModel.create({
      user: customerUser._id,
      fullName: 'Approved Applicant',
      dateOfBirth: new Date('1995-05-15'),
      gender: 'FEMALE',
      mobileNumber: '9876543210',
      email: 'approved_app@bank.com',
      address: '123 Test Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      pinCode: '400001',
      idType: 'PAN',
      idNumber: 'ABCDE1234F',
      accountType: 'SAVINGS',
      initialDeposit: 1500,
      status: 'PENDING',
    });

    const approveRes = await apiRequest(`/api/account-applications/system/${appToApprove._id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sysToken}` },
    });
    assert(approveRes.status === 200, 'Account application approved successfully');

    const approveAudit = await auditLogModel.findOne({
      resourceId: appToApprove._id,
      action: 'APPLICATION_APPROVED',
    }).sort({ createdAt: -1 });

    assert(Boolean(approveAudit), 'APPLICATION_APPROVED audit event recorded');
    assert(String(approveAudit?.actor) === String(systemUser._id), 'APPLICATION_APPROVED actor is system user');
    assert(approveAudit?.previousState?.status === 'PENDING', 'Approve previous state is PENDING');
    assert(approveAudit?.newState?.status === 'APPROVED', 'Approve new state is APPROVED');
    assert(Boolean(approveAudit?.newState?.createdAccountId), 'Approve new state contains createdAccountId');
    assert(approveAudit?.metadata?.initialDeposit === 1500, 'Metadata contains initialDeposit amount');

    // Test Application Rejection
    const appToReject = await accountApplicationModel.create({
      user: customerUser._id,
      fullName: 'Rejected Applicant',
      dateOfBirth: new Date('1992-08-20'),
      gender: 'MALE',
      mobileNumber: '9876543211',
      email: 'rejected_app@bank.com',
      address: '456 Test Avenue',
      city: 'Delhi',
      state: 'Delhi',
      pinCode: '110001',
      idType: 'AADHAAR',
      idNumber: '123456789012',
      accountType: 'SAVINGS',
      initialDeposit: 1000,
      status: 'PENDING',
    });

    const rejectReason = 'National ID document image illegible';
    const rejectRes = await apiRequest(`/api/account-applications/system/${appToReject._id}/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sysToken}` },
      body: { rejectionReason: rejectReason },
    });
    assert(rejectRes.status === 200, 'Account application rejected successfully');

    const rejectAudit = await auditLogModel.findOne({
      resourceId: appToReject._id,
      action: 'APPLICATION_REJECTED',
    }).sort({ createdAt: -1 });

    assert(Boolean(rejectAudit), 'APPLICATION_REJECTED audit event recorded');
    assert(rejectAudit?.previousState?.status === 'PENDING', 'Reject previous state is PENDING');
    assert(rejectAudit?.newState?.status === 'REJECTED', 'Reject new state is REJECTED');
    assert(rejectAudit?.reason === rejectReason, 'Reject reason matches submitted reason');

    // 7. Transaction Reversal & System Funds Auditing
    console.log('\n--- Phase 7: Transaction Reversal & System Funds Audit Logging ---');
    // Create accounts & completed transaction
    const senderAcc = await accountModel.create({
      user: customerUser._id,
      accountHolderName: 'Reversal Sender',
      accountType: 'SAVINGS',
      status: 'ACTIVE',
      currency: 'INR',
    });

    const receiverAcc = await accountModel.create({
      user: customerUser._id,
      accountHolderName: 'Reversal Receiver',
      accountType: 'SAVINGS',
      status: 'ACTIVE',
      currency: 'INR',
    });

    // Seed receiver with balance so reversal debit succeeds
    const seedTx = await transactionModel.create({
      fromAccount: receiverAcc._id,
      toAccount: receiverAcc._id,
      amount: 2000,
      status: 'COMPLETED',
      idempotencyKey: `STEP5_SEED_${runId}`,
    });

    await ladgerModel.create([
      { account: receiverAcc._id, amount: 2000, transaction: seedTx._id, type: 'CREDIT' },
    ]);

    const completedTx = await transactionModel.create({
      fromAccount: senderAcc._id,
      toAccount: receiverAcc._id,
      amount: 1000,
      status: 'COMPLETED',
      idempotencyKey: `STEP5_TX_${runId}`,
    });

    await ladgerModel.create([
      { account: senderAcc._id, amount: 1000, transaction: completedTx._id, type: 'DEBIT' },
      { account: receiverAcc._id, amount: 1000, transaction: completedTx._id, type: 'CREDIT' },
    ]);

    // Reverse transaction
    const reversalReason = 'Duplicate charge reported by customer service';
    const reverseRes = await apiRequest(`/api/transactions/${completedTx._id}/reverse`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sysToken}` },
      body: { reason: reversalReason },
    });
    assert(reverseRes.status === 200, 'Transaction reversed successfully by system admin');

    const reverseAudit = await auditLogModel.findOne({
      resourceId: completedTx._id,
      action: 'TRANSACTION_REVERSED',
    }).sort({ createdAt: -1 });

    assert(Boolean(reverseAudit), 'TRANSACTION_REVERSED audit event recorded');
    assert(String(reverseAudit?.actor) === String(systemUser._id), 'TRANSACTION_REVERSED actor is system user');
    assert(reverseAudit?.previousState?.status === 'COMPLETED', 'Reversal previous state is COMPLETED');
    assert(reverseAudit?.newState?.status === 'REVERSED', 'Reversal new state is REVERSED');
    assert(reverseAudit?.reason === reversalReason, 'Reversal reason matches submitted reason');
    assert(reverseAudit?.metadata?.amount === 1000, 'Reversal metadata captures transaction amount');

    // 8. Single Audit Log Detail & Filtering Queries
    console.log('\n--- Phase 8: Audit Log Querying, Pagination, and Filters ---');
    const getByIdRes = await apiRequest(`/api/audit-logs/${reverseAudit._id}`, {
      headers: { Authorization: `Bearer ${sysToken}` },
    });
    assert(getByIdRes.status === 200, 'GET /api/audit-logs/:id returns 200 OK');
    assert(getByIdRes.body?.auditLog?.action === 'TRANSACTION_REVERSED', 'Single audit log has matching action');
    assert(Boolean(getByIdRes.body?.auditLog?.actor?.name), 'Single audit log populates actor details');

    // Action filter
    const actionFilterRes = await apiRequest('/api/audit-logs?action=TRANSACTION_REVERSED', {
      headers: { Authorization: `Bearer ${sysToken}` },
    });
    assert(actionFilterRes.status === 200, 'GET /api/audit-logs?action=TRANSACTION_REVERSED returns 200');
    assert(
      actionFilterRes.body?.auditLogs.every((l) => l.action === 'TRANSACTION_REVERSED'),
      'All filtered logs match action TRANSACTION_REVERSED'
    );

    // Resource filter
    const resourceFilterRes = await apiRequest('/api/audit-logs?resourceType=ACCOUNT', {
      headers: { Authorization: `Bearer ${sysToken}` },
    });
    assert(resourceFilterRes.status === 200, 'GET /api/audit-logs?resourceType=ACCOUNT returns 200');
    assert(
      resourceFilterRes.body?.auditLogs.every((l) => l.resourceType === 'ACCOUNT'),
      'All filtered logs match resourceType ACCOUNT'
    );

    // Search filter
    const searchRes = await apiRequest(`/api/audit-logs?search=${custAccount._id}`, {
      headers: { Authorization: `Bearer ${sysToken}` },
    });
    assert(searchRes.status === 200, 'Search by resourceId returns 200 OK');
    assert(
      searchRes.body?.auditLogs.some((l) => String(l.resourceId) === String(custAccount._id)),
      'Search results contain the expected resourceId'
    );

    // Pagination limit check
    const paginationRes = await apiRequest('/api/audit-logs?limit=2&page=1', {
      headers: { Authorization: `Bearer ${sysToken}` },
    });
    assert(paginationRes.status === 200, 'Pagination query returns 200 OK');
    assert(paginationRes.body?.auditLogs.length <= 2, 'Limit 2 is strictly respected');
    assert(paginationRes.body?.pagination?.limit === 2, 'Pagination limit parameter reported accurately');

    // Invalid ID handling
    const invalidIdRes = await apiRequest('/api/audit-logs/invalid-id-123', {
      headers: { Authorization: `Bearer ${sysToken}` },
    });
    assert(invalidIdRes.status === 400, 'GET /api/audit-logs/invalid-id returns 400 Bad Request');

    const notFoundIdRes = await apiRequest(`/api/audit-logs/${new mongoose.Types.ObjectId()}`, {
      headers: { Authorization: `Bearer ${sysToken}` },
    });
    assert(notFoundIdRes.status === 404, 'GET /api/audit-logs/nonexistent-id returns 404 Not Found');

    console.log('\n==================================================');
    console.log(`STEP 5 AUDIT LOG TEST SUITE COMPLETE: ${passedAssertions}/${totalAssertions} ASSERTIONS PASSED`);
    console.log('==================================================\n');
  } catch (error) {
    console.error('Fatal error during Step 5 test execution:', error);
    process.exitCode = 1;
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('Test HTTP server closed');
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }
  }
}

if (require.main === module) {
  runStep5Tests();
}

module.exports = runStep5Tests;

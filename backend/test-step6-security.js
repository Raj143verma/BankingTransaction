/**
 * Integration & Security Test Suite for STEP 6:
 * "System Security, Session & Access Control Hardening"
 * Uses native Node.js fetch and http server (zero external test dependencies)
 */
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const path = require('path');
process.env.NODE_ENV = 'test';
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const userModel = require('./src/models/user.model');
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

async function runStep6Tests() {
  console.log('\n==================================================');
  console.log('STARTING STEP 6 SECURITY INTEGRATION TEST SUITE');
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
      console.log('Connected to MongoDB for Step 6 test suite');
    }

    // Set test env variables for lockout
    process.env.SYSTEM_LOGIN_MAX_ATTEMPTS = '3';
    process.env.SYSTEM_LOGIN_LOCKOUT_MINUTES = '15';

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
      email: `syssec_${runId}@bank.com`,
      name: 'System Security Admin',
      password: 'AdminPassword123!',
      systemUser: true,
      sessionVersion: 1,
    });
    assert(systemUser.systemUser === true, 'System user created with systemUser=true');
    assert(systemUser.sessionVersion === 1, 'Initial sessionVersion is 1');

    const customerUser = await userModel.create({
      email: `custsec_${runId}@bank.com`,
      name: 'Security Customer',
      password: 'CustomerPassword123!',
      systemUser: false,
      sessionVersion: 1,
    });
    assert(customerUser.systemUser === false, 'Customer user created with systemUser=false');

    // 2. Unauthenticated and RBAC access checks
    console.log('\n--- Phase 2: Unauthenticated and Customer RBAC Access Checks ---');
    const unauthSessionStatus = await apiRequest('/api/auth/session-status');
    assert(unauthSessionStatus.status === 401, 'Unauthenticated GET /api/auth/session-status returns 401');

    const unauthChangePassword = await apiRequest('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: 'foo', newPassword: 'bar' },
    });
    assert(unauthChangePassword.status === 401, 'Unauthenticated POST /api/auth/change-password returns 401');

    const unauthRevoke = await apiRequest('/api/auth/revoke-sessions', {
      method: 'POST',
    });
    assert(unauthRevoke.status === 401, 'Unauthenticated POST /api/auth/revoke-sessions returns 401');

    // Customer token
    const customerToken = jwt.sign(
      { id: customerUser._id, sessionVersion: 1 },
      JWT_SECRET,
      { expiresIn: '3d' }
    );
    const customerAuditAccess = await apiRequest('/api/audit-logs', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(customerAuditAccess.status === 403, 'Customer token cannot access system-only /api/audit-logs endpoint');

    // 3. Valid System-User Authentication & Session Status
    console.log('\n--- Phase 3: Valid Authentication & Session Status ---');
    const loginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: systemUser.email, password: 'AdminPassword123!' },
    });
    assert(loginRes.status === 200, 'Valid system-user login returns 200 OK');
    assert(loginRes.body.token, 'Login response contains JWT token');
    assert(loginRes.body.user.sessionVersion === 1, 'Login response includes sessionVersion');

    const sysToken = loginRes.body.token;

    // Check session-status endpoint
    const statusRes = await apiRequest('/api/auth/session-status', {
      headers: { Authorization: `Bearer ${sysToken}` },
    });
    assert(statusRes.status === 200, 'GET /api/auth/session-status returns 200 OK');
    assert(statusRes.body.session.active === true, 'Session status indicates active=true');
    assert(statusRes.body.session.sessionVersion === 1, 'Session status reports sessionVersion 1');
    assert(statusRes.body.session.lastLoginAt !== null, 'Session status reports valid lastLoginAt');
    assert(!statusRes.body.user.password, 'Session status does not expose password or hash');

    // 4. Failed Login Tracking & Account Lockout
    console.log('\n--- Phase 4: Failed Login Tracking & Account Lockout ---');
    // Attempt 1: Wrong password
    const fail1 = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: systemUser.email, password: 'WrongPassword999!' },
    });
    assert(fail1.status === 401, 'Failed login 1 returns 401');
    assert(fail1.body.message === 'Invalid email or password', 'Failed login returns generic authentication error message');

    let updatedSysUser = await userModel.findById(systemUser._id).select('+failedLoginAttempts +lockedUntil');
    assert(updatedSysUser.failedLoginAttempts === 1, 'Failed login attempts incremented to 1');
    assert(updatedSysUser.lockedUntil === null, 'Account is not locked after 1 failed attempt');

    // Attempt 2: Wrong password
    const fail2 = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: systemUser.email, password: 'WrongPassword999!' },
    });
    assert(fail2.status === 401, 'Failed login 2 returns 401');
    updatedSysUser = await userModel.findById(systemUser._id).select('+failedLoginAttempts +lockedUntil');
    assert(updatedSysUser.failedLoginAttempts === 2, 'Failed login attempts incremented to 2');

    // Attempt 3: Wrong password (triggers lockout at threshold = 3)
    const fail3 = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: systemUser.email, password: 'WrongPassword999!' },
    });
    assert(fail3.status === 423, 'Attempt exceeding max attempts triggers 423 Locked');
    assert(fail3.body.message.includes('locked'), 'Response message indicates account is locked');

    updatedSysUser = await userModel.findById(systemUser._id).select('+failedLoginAttempts +lockedUntil');
    assert(updatedSysUser.failedLoginAttempts === 3, 'Failed login attempts reaches 3');
    assert(updatedSysUser.lockedUntil !== null, 'lockedUntil timestamp is set');
    assert(new Date(updatedSysUser.lockedUntil) > new Date(), 'lockedUntil is in the future');

    // Attempt while locked (even with correct password)
    const lockedLogin = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: systemUser.email, password: 'AdminPassword123!' },
    });
    assert(lockedLogin.status === 423, 'Locked account cannot authenticate even with correct password');

    // Verify lockout expiration mechanism
    console.log('\n--- Phase 5: Lockout Expiration & Reset ---');
    // Simulate expired lockout by setting lockedUntil to 1 minute ago
    await userModel.findByIdAndUpdate(systemUser._id, {
      lockedUntil: new Date(Date.now() - 60 * 1000),
    });

    const unlockLogin = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: systemUser.email, password: 'AdminPassword123!' },
    });
    assert(unlockLogin.status === 200, 'Login succeeds after lockout expiration');
    const freshToken = unlockLogin.body.token;

    updatedSysUser = await userModel.findById(systemUser._id).select('+failedLoginAttempts +lockedUntil +lastLoginAt');
    assert(updatedSysUser.failedLoginAttempts === 0, 'Successful login resets failedLoginAttempts to 0');
    assert(updatedSysUser.lockedUntil === null, 'Successful login clears lockedUntil');
    assert(updatedSysUser.lastLoginAt !== null, 'Successful login updates lastLoginAt');

    // 6. Password Policy & Password Change
    console.log('\n--- Phase 6: Password Policy Enforcement & Password Change ---');
    // Missing current password
    const noCurrentPw = await apiRequest('/api/auth/change-password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` },
      body: { newPassword: 'NewAdminPassword456!' },
    });
    assert(noCurrentPw.status === 400, 'Password change without currentPassword returns 400');

    // Wrong current password
    const wrongCurrentPw = await apiRequest('/api/auth/change-password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` },
      body: { currentPassword: 'IncorrectOldPassword!', newPassword: 'NewAdminPassword456!' },
    });
    assert(wrongCurrentPw.status === 400, 'Wrong current password is rejected with 400');

    // Identical new password
    const samePw = await apiRequest('/api/auth/change-password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` },
      body: { currentPassword: 'AdminPassword123!', newPassword: 'AdminPassword123!' },
    });
    assert(samePw.status === 400, 'New password matching current password is rejected with 400');

    // Weak password policy failure (no uppercase/symbols)
    const weakPw = await apiRequest('/api/auth/change-password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` },
      body: { currentPassword: 'AdminPassword123!', newPassword: 'simplepassword' },
    });
    assert(weakPw.status === 400, 'Weak new password failing policy is rejected with 400');

    // Successful Password Change
    const validChange = await apiRequest('/api/auth/change-password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` },
      body: {
        currentPassword: 'AdminPassword123!',
        newPassword: 'NewAdminSecurePassword456!',
        confirmPassword: 'NewAdminSecurePassword456!',
      },
    });
    assert(validChange.status === 200, 'Valid password change returns 200 OK');
    assert(validChange.body.sessionVersion === 2, 'Password change increments sessionVersion to 2');
    const tokenAfterPwChange = validChange.body.token;

    // 7. Invalidation of previous tokens after password change
    console.log('\n--- Phase 7: Invalidation of Previous Tokens via sessionVersion ---');
    const oldTokenCheck = await apiRequest('/api/auth/session-status', {
      headers: { Authorization: `Bearer ${freshToken}` },
    });
    assert(oldTokenCheck.status === 401, 'Old JWT token is rejected after password change');
    assert(
      oldTokenCheck.body.message.includes('revoked') || oldTokenCheck.body.message.includes('invalid'),
      'Old token rejected with session revoked/invalid message'
    );

    const newTokenCheck = await apiRequest('/api/auth/session-status', {
      headers: { Authorization: `Bearer ${tokenAfterPwChange}` },
    });
    assert(newTokenCheck.status === 200, 'New JWT token with updated sessionVersion is accepted');

    // 8. Session Revocation Endpoint
    console.log('\n--- Phase 8: Controlled Session Revocation ---');
    const revokeRes = await apiRequest('/api/auth/revoke-sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAfterPwChange}` },
    });
    assert(revokeRes.status === 200, 'POST /api/auth/revoke-sessions returns 200 OK');
    assert(revokeRes.body.sessionVersion === 3, 'Revoke sessions increments sessionVersion to 3');
    const tokenAfterRevoke = revokeRes.body.token;

    // Verify token from before revoke is now invalid
    const preRevokeCheck = await apiRequest('/api/auth/session-status', {
      headers: { Authorization: `Bearer ${tokenAfterPwChange}` },
    });
    assert(preRevokeCheck.status === 401, 'Pre-revocation token is rejected with 401');

    // Verify new token works
    const postRevokeCheck = await apiRequest('/api/auth/session-status', {
      headers: { Authorization: `Bearer ${tokenAfterRevoke}` },
    });
    assert(postRevokeCheck.status === 200, 'Post-revocation token works with 200 OK');

    // 9. Security Audit Trail Verification
    console.log('\n--- Phase 9: Security Audit Trail Verification ---');
    // Check LOGIN_FAILED event
    const loginFailLogs = await auditLogModel.find({
      action: 'LOGIN_FAILED',
      resourceId: systemUser._id,
    });
    assert(loginFailLogs.length > 0, 'LOGIN_FAILED audit events recorded');
    assert(loginFailLogs[0].ipAddress !== undefined, 'Audit log captures client IP');
    assert(loginFailLogs[0].userAgent !== undefined, 'Audit log captures client User-Agent');

    // Check SYSTEM_ACCOUNT_LOCKED event
    const lockLogs = await auditLogModel.find({
      action: 'SYSTEM_ACCOUNT_LOCKED',
      resourceId: systemUser._id,
    });
    assert(lockLogs.length > 0, 'SYSTEM_ACCOUNT_LOCKED audit event recorded');
    assert(lockLogs[0].reason.includes('max failed'), 'Account lock event contains reason');

    // Check PASSWORD_CHANGED event
    const pwLogs = await auditLogModel.find({
      action: 'PASSWORD_CHANGED',
      resourceId: systemUser._id,
    });
    assert(pwLogs.length > 0, 'PASSWORD_CHANGED audit event recorded');
    assert(pwLogs[0].metadata.sessionVersion === 2, 'PASSWORD_CHANGED records updated sessionVersion in metadata');

    // Check SESSIONS_REVOKED event
    const revokeLogs = await auditLogModel.find({
      action: 'SESSIONS_REVOKED',
      resourceId: systemUser._id,
    });
    assert(revokeLogs.length > 0, 'SESSIONS_REVOKED audit event recorded');
    assert(revokeLogs[0].metadata.newSessionVersion === 3, 'SESSIONS_REVOKED records new sessionVersion in metadata');

    // Verify No Secrets in Audit Logs
    console.log('\n--- Phase 10: Secret Safety Inspection in Audit Logs ---');
    const allSecurityLogs = await auditLogModel.find({
      resourceId: systemUser._id,
    });
    for (const log of allSecurityLogs) {
      const serialized = JSON.stringify(log);
      assert(!serialized.includes('AdminPassword123!'), 'No raw passwords in audit document');
      assert(!serialized.includes('NewAdminSecurePassword456!'), 'No new raw passwords in audit document');
      assert(!serialized.includes('test_secret'), 'No JWT secret in audit document');
      assert(!serialized.includes('Bearer '), 'No Bearer tokens in audit document');
    }
    console.log('  ✓ PASS: All audit documents confirmed clean of credentials and secrets');

    console.log('\n==================================================');
    console.log(`STEP 6 SECURITY TEST SUITE COMPLETE: ${passedAssertions}/${totalAssertions} ASSERTIONS PASSED`);
    console.log('==================================================\n');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('Test HTTP server closed');
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB\n');
    }
  }
}

if (require.main === module) {
  runStep6Tests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\nSTEP 6 TEST SUITE FAILED:', err);
      process.exit(1);
    });
}

module.exports = runStep6Tests;

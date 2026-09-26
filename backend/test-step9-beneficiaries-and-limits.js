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
const beneficiaryModel = require('./src/models/beneficiary.model');
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

async function runTests() {
  console.log('\n==================================================');
  console.log('STARTING STEP 9 BENEFICIARIES & LIMITS SUITE');
  console.log('==================================================\n');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB for Step 9 test suite');

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Step 9 test server listening on port ${port}\n`);

  let passedCount = 0;
  let failedCount = 0;

  function assert(testNum, title, condition, details = '') {
    if (condition) {
      logTest(testNum, title, true);
      passedCount++;
    } else {
      logTest(testNum, title, false, details);
      failedCount++;
    }
  }

  try {
    const timestamp = Date.now();

    // 1. Create Test Users
    const customerUserA = await userModel.create({
      name: `Alice Step9 Customer ${timestamp}`,
      email: `alice.step9.${timestamp}@bank.com`,
      password: 'StrongPassword123!',
      systemUser: false,
      sessionVersion: 1,
    });
    const tokenA = generateToken(customerUserA);

    const customerUserB = await userModel.create({
      name: `Bob Step9 Customer ${timestamp}`,
      email: `bob.step9.${timestamp}@bank.com`,
      password: 'StrongPassword123!',
      systemUser: false,
      sessionVersion: 1,
    });
    const tokenB = generateToken(customerUserB);

    const customerUserC = await userModel.create({
      name: `Charlie Step9 Customer ${timestamp}`,
      email: `charlie.step9.${timestamp}@bank.com`,
      password: 'StrongPassword123!',
      systemUser: false,
      sessionVersion: 1,
    });
    const tokenC = generateToken(customerUserC);

    const systemUser = await userModel.create({
      name: `Admin Step9 Officer ${timestamp}`,
      email: `admin.step9.${timestamp}@bank.com`,
      password: 'StrongPassword123!',
      systemUser: true,
      sessionVersion: 1,
    });
    const systemToken = generateToken(systemUser);

    // 2. Create Accounts
    const systemAccount = await accountModel.create({
      user: systemUser._id,
      accountHolderName: 'System Central Vault',
      accountType: 'SAVINGS',
      currency: 'INR',
      status: 'ACTIVE',
    });

    const accountA1 = await accountModel.create({
      user: customerUserA._id,
      accountHolderName: 'Alice Primary',
      accountType: 'SAVINGS',
      currency: 'INR',
      status: 'ACTIVE',
    });

    const accountA2 = await accountModel.create({
      user: customerUserA._id,
      accountHolderName: 'Alice Secondary',
      accountType: 'SAVINGS',
      currency: 'INR',
      status: 'ACTIVE',
    });

    const accountB1 = await accountModel.create({
      user: customerUserB._id,
      accountHolderName: 'Bob Primary',
      accountType: 'SAVINGS',
      currency: 'INR',
      status: 'ACTIVE',
    });

    const accountB_Suspended = await accountModel.create({
      user: customerUserB._id,
      accountHolderName: 'Bob Suspended Account',
      accountType: 'SAVINGS',
      currency: 'INR',
      status: 'SUSPENDED',
    });

    const accountC1 = await accountModel.create({
      user: customerUserC._id,
      accountHolderName: 'Charlie Primary',
      accountType: 'SAVINGS',
      currency: 'INR',
      status: 'ACTIVE',
    });

    // 3. Fund Account A1 with ₹500,000 from System Account via direct ledger entry
    const initialTx = await transactionModel.create({
      fromAccount: systemAccount._id,
      toAccount: accountA1._id,
      amount: 500000,
      status: 'COMPLETED',
      idempotencyKey: `fund-step9-a1-${timestamp}`,
    });
    await ladgerModel.create({
      account: accountA1._id,
      amount: 500000,
      transaction: initialTx._id,
      type: 'CREDIT',
    });

    // 4. Ensure System Limit Configuration is set to predictable defaults
    await transferLimitConfigModel.deleteMany({});
    const initialConfig = await transferLimitConfigModel.create({
      perTransactionLimit: 50000,
      dailyAmountLimit: 100000,
      dailyCountLimit: 5,
      beneficiaryCooldownMinutes: 30,
      updatedBy: systemUser._id,
    });

    console.log('--- BENEFICIARY TESTS ---\n');

    // Test 1: Unauthenticated access -> 401
    const res1 = await request('/api/beneficiaries');
    assert(1, 'Unauthenticated access to beneficiaries returns 401', res1.status === 401);

    // Test 2: Authenticated customer can list own beneficiaries (initially empty)
    const res2 = await request('/api/beneficiaries', { token: tokenA });
    assert(
      2,
      'Authenticated customer can list own beneficiaries',
      res2.status === 200 && Array.isArray(res2.data.beneficiaries) && res2.data.beneficiaries.length === 0
    );

    // Test 3: Customer cannot access another customer\'s beneficiary (IDOR protection)
    const bobBeneficiary = await beneficiaryModel.create({
      user: customerUserB._id,
      sourceAccount: accountB1._id,
      account: accountC1._id,
      nickname: 'Charlie via Bob',
      accountHolderName: 'Charlie Primary',
      status: 'ACTIVE',
      coolingOffExpiresAt: null,
      activatedAt: new Date(),
    });

    const res3 = await request(`/api/beneficiaries/${bobBeneficiary._id}`, { token: tokenA });
    assert(
      3,
      'Customer cannot access another customer\'s beneficiary (IDOR prevention)',
      res3.status === 404 || res3.status === 403
    );

    // Test 4: Customer cannot create beneficiary for another user\'s source account
    const res4 = await request('/api/beneficiaries', {
      method: 'POST',
      token: tokenA,
      body: {
        sourceAccount: accountB1._id.toString(), // Alice tries to use Bob's account
        toAccount: accountC1._id.toString(),
        nickname: 'Illegitimate Beneficiary',
      },
    });
    assert(
      4,
      'Customer cannot create beneficiary for an unowned source account',
      res4.status === 403 || res4.status === 400
    );

    // Test 5: Nonexistent destination account rejected
    const res5 = await request('/api/beneficiaries', {
      method: 'POST',
      token: tokenA,
      body: {
        sourceAccount: accountA1._id.toString(),
        toAccount: new mongoose.Types.ObjectId().toString(),
        nickname: 'Nonexistent Account',
      },
    });
    assert(
      5,
      'Nonexistent destination account is rejected',
      res5.status === 404 || res5.status === 400
    );

    // Test 6: Inactive/suspended destination account rejected
    const res6 = await request('/api/beneficiaries', {
      method: 'POST',
      token: tokenA,
      body: {
        sourceAccount: accountA1._id.toString(),
        toAccount: accountB_Suspended._id.toString(),
        nickname: 'Bob Suspended Payee',
      },
    });
    assert(
      6,
      'Suspended destination account is rejected from being added',
      res6.status === 400
    );

    // Test 7: Self-beneficiary rejected (Alice adding Alice's other account or same account)
    const res7 = await request('/api/beneficiaries', {
      method: 'POST',
      token: tokenA,
      body: {
        sourceAccount: accountA1._id.toString(),
        toAccount: accountA2._id.toString(), // Alice's own second account
        nickname: 'My Other Account',
      },
    });
    assert(
      7,
      'Customer cannot add their own account as a beneficiary',
      res7.status === 400
    );

    // Create a valid beneficiary: Alice adds Bob (accountB1)
    const resCreateB = await request('/api/beneficiaries', {
      method: 'POST',
      token: tokenA,
      body: {
        sourceAccount: accountA1._id.toString(),
        toAccount: accountB1._id.toString(),
        nickname: 'Bob Rent',
        maxTransferLimit: 25000,
      },
    });
    const createdBeneficiary = resCreateB.data?.beneficiary;

    // Test 8: Duplicate active beneficiary rejected
    const res8 = await request('/api/beneficiaries', {
      method: 'POST',
      token: tokenA,
      body: {
        sourceAccount: accountA1._id.toString(),
        toAccount: accountB1._id.toString(),
        nickname: 'Bob Rent Duplicate',
      },
    });
    assert(
      8,
      'Duplicate active beneficiary for same source and destination is rejected',
      res8.status === 409 || res8.status === 400
    );

    // Test 9: Beneficiary activation rules & cooling-off enforced
    assert(
      9,
      'Newly created beneficiary is placed in COOLING_OFF status with future expiry',
      createdBeneficiary &&
        createdBeneficiary.status === 'COOLING_OFF' &&
        new Date(createdBeneficiary.coolingOffExpiresAt) > new Date()
    );

    // Attempt transfer during cooling-off -> blocked
    const resTransferBlocked = await request('/api/transactions', {
      method: 'POST',
      token: tokenA,
      body: {
        fromAccount: accountA1._id.toString(),
        toAccount: accountB1._id.toString(),
        amount: 5000,
        idempotencyKey: `tx-cooling-${timestamp}`,
      },
    });
    assert(
      '9b',
      'Transfer to beneficiary in active cooling-off period is blocked',
      resTransferBlocked.status === 400 &&
        resTransferBlocked.data?.message?.toLowerCase().includes('cooling-off')
    );

    // Manually expire cooling off for created beneficiary to test activation
    await beneficiaryModel.findByIdAndUpdate(createdBeneficiary._id, {
      $set: {
        coolingOffExpiresAt: new Date(Date.now() - 1000),
      },
    });

    const resActivate = await request(`/api/beneficiaries/${createdBeneficiary._id}/activate`, {
      method: 'PATCH',
      token: tokenA,
    });
    assert(
      '9c',
      'Beneficiary can be activated after cooling-off period has passed',
      resActivate.status === 200 && resActivate.data?.beneficiary?.status === 'ACTIVE'
    );

    // Test 10: Beneficiary deactivation works
    const res10 = await request(`/api/beneficiaries/${createdBeneficiary._id}/deactivate`, {
      method: 'PATCH',
      token: tokenA,
    });
    assert(
      10,
      'Beneficiary deactivation sets status to INACTIVE',
      res10.status === 200 && res10.data?.beneficiary?.status === 'INACTIVE'
    );

    // Reactivate for further tests
    await request(`/api/beneficiaries/${createdBeneficiary._id}/activate`, {
      method: 'PATCH',
      token: tokenA,
    });

    // Test 11: Beneficiary removal ownership enforced
    // Charlie tries to remove Alice's beneficiary -> 404/403
    const res11_unauthorized = await request(`/api/beneficiaries/${createdBeneficiary._id}`, {
      method: 'DELETE',
      token: tokenC,
    });
    assert(
      11,
      'Beneficiary removal ownership is strictly enforced against non-owners',
      res11_unauthorized.status === 404 || res11_unauthorized.status === 403
    );

    // Test 12: Malformed beneficiary ID handled safely
    const res12 = await request('/api/beneficiaries/invalid-mongo-id-123', {
      token: tokenA,
    });
    assert(
      12,
      'Malformed beneficiary ObjectId is rejected safely with 400',
      res12.status === 400
    );

    console.log('\n--- TRANSFER LIMIT TESTS ---\n');

    // Test 13: Transaction above per-transfer limit rejected (limit: 50,000; attempt: 60,000)
    const res13 = await request('/api/transactions', {
      method: 'POST',
      token: tokenA,
      body: {
        fromAccount: accountA1._id.toString(),
        toAccount: accountC1._id.toString(),
        amount: 60000,
        idempotencyKey: `tx-above-pertx-${timestamp}`,
      },
    });
    assert(
      13,
      'Transfer above per-transaction limit (₹50,000) is rejected',
      res13.status === 400 &&
        res13.data?.message?.toLowerCase().includes('per-transaction limit')
    );

    // Beneficiary-specific limit test (Bob has maxTransferLimit: 25,000; attempt: 30,000)
    const resBeneficiaryLimit = await request('/api/transactions', {
      method: 'POST',
      token: tokenA,
      body: {
        fromAccount: accountA1._id.toString(),
        toAccount: accountB1._id.toString(),
        amount: 30000,
        idempotencyKey: `tx-above-beneficiary-limit-${timestamp}`,
      },
    });
    assert(
      '13b',
      'Transfer above beneficiary-specific limit (₹25,000) is rejected',
      resBeneficiaryLimit.status === 400 &&
        resBeneficiaryLimit.data?.message?.toLowerCase().includes('beneficiary transfer limit')
    );

    // Make 2 valid transfers of ₹20,000 to Bob (total: 40,000 / daily limit 100,000)
    const txSuccess1 = await request('/api/transactions', {
      method: 'POST',
      token: tokenA,
      body: {
        fromAccount: accountA1._id.toString(),
        toAccount: accountB1._id.toString(),
        amount: 20000,
        idempotencyKey: `tx-success-1-${timestamp}`,
      },
    });
    const txSuccess2 = await request('/api/transactions', {
      method: 'POST',
      token: tokenA,
      body: {
        fromAccount: accountA1._id.toString(),
        toAccount: accountB1._id.toString(),
        amount: 20000,
        idempotencyKey: `tx-success-2-${timestamp}`,
      },
    });
    assert(
      '13c',
      'Valid transfers within all limits complete successfully',
      txSuccess1.status === 201 && txSuccess2.status === 201
    );

    // Make 1 more transfer of ₹50,000 to Charlie (total spent today: 90,000; count: 3)
    const txSuccess3 = await request('/api/transactions', {
      method: 'POST',
      token: tokenA,
      body: {
        fromAccount: accountA1._id.toString(),
        toAccount: accountC1._id.toString(),
        amount: 50000,
        idempotencyKey: `tx-success-3-${timestamp}`,
      },
    });
    assert('13d', 'Third valid transfer completes (daily total ₹90,000)', txSuccess3.status === 201);

    // Test 14: Daily amount limit enforced (limit 100,000; spent 90,000; attempt 20,000 -> exceeds 100,000)
    const res14 = await request('/api/transactions', {
      method: 'POST',
      token: tokenA,
      body: {
        fromAccount: accountA1._id.toString(),
        toAccount: accountC1._id.toString(),
        amount: 20000,
        idempotencyKey: `tx-exceed-daily-amt-${timestamp}`,
      },
    });
    assert(
      14,
      'Daily cumulative transfer amount limit is strictly enforced',
      res14.status === 400 &&
        res14.data?.message?.toLowerCase().includes('daily transfer limit exceeded')
    );

    // Make a small transfer of ₹5,000 (total: 95,000; count: 4)
    const txSuccess4 = await request('/api/transactions', {
      method: 'POST',
      token: tokenA,
      body: {
        fromAccount: accountA1._id.toString(),
        toAccount: accountC1._id.toString(),
        amount: 5000,
        idempotencyKey: `tx-success-4-${timestamp}`,
      },
    });
    // Make another small transfer of ₹2,000 (total: 97,000; count: 5 / dailyCountLimit: 5)
    const txSuccess5 = await request('/api/transactions', {
      method: 'POST',
      token: tokenA,
      body: {
        fromAccount: accountA1._id.toString(),
        toAccount: accountC1._id.toString(),
        amount: 2000,
        idempotencyKey: `tx-success-5-${timestamp}`,
      },
    });
    assert('14b', '5th transfer completes reaching daily count limit', txSuccess5.status === 201);

    // Test 15: Daily transaction count limit enforced (count limit: 5; attempt 6th transaction of ₹1,000)
    const res15 = await request('/api/transactions', {
      method: 'POST',
      token: tokenA,
      body: {
        fromAccount: accountA1._id.toString(),
        toAccount: accountC1._id.toString(),
        amount: 1000,
        idempotencyKey: `tx-exceed-count-${timestamp}`,
      },
    });
    assert(
      15,
      'Daily transaction count limit (5) is enforced',
      res15.status === 400 &&
        res15.data?.message?.toLowerCase().includes('daily transaction count limit exceeded')
    );

    // Test 16: Failed transactions do not consume limits
    // Create an explicit failed transaction directly in DB
    await transactionModel.create({
      fromAccount: accountA1._id,
      toAccount: accountC1._id,
      amount: 50000,
      status: 'FAILED',
      idempotencyKey: `tx-failed-dummy-${timestamp}`,
    });
    // Verify customer transfer limit summary
    const resLimits = await request(`/api/transfer-limits?accountId=${accountA1._id}`, {
      token: tokenA,
    });
    assert(
      16,
      'Failed transactions do not consume daily amounts or count limits',
      resLimits.status === 200 &&
        resLimits.data.limits.dailySpent === 97000 &&
        resLimits.data.limits.dailyCount === 5
    );

    // Test 17: Reversed transactions do not count towards daily limits
    // Reverse txSuccess4 (₹5,000) using system user endpoint
    const tx4Id = txSuccess4.data?.transaction?._id;
    const resReverse = await request(`/api/transactions/${tx4Id}/reverse`, {
      method: 'POST',
      token: systemToken,
      body: {
        reason: 'Customer initiated test reversal for Step 9 verification',
      },
    });
    assert('17a', 'Transaction reversed successfully by system user', resReverse.status === 200);

    // Verify limit summary after reversal: daily spent should now be 92,000 and count 4
    const resLimitsAfterReversal = await request(`/api/transfer-limits?accountId=${accountA1._id}`, {
      token: tokenA,
    });
    assert(
      17,
      'Reversed transactions are excluded from daily limit calculations',
      resLimitsAfterReversal.status === 200 &&
        resLimitsAfterReversal.data.limits.dailySpent === 92000 &&
        resLimitsAfterReversal.data.limits.dailyCount === 4
    );

    // Test 18: Date boundary calculations are correct (yesterday\'s transactions do not consume today\'s limits)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0);

    const oldTx = await transactionModel.create({
      fromAccount: accountA1._id,
      toAccount: accountC1._id,
      amount: 50000,
      status: 'COMPLETED',
      idempotencyKey: `tx-yesterday-${timestamp}`,
      createdAt: yesterday,
    });
    // Re-verify limits: should remain 92,000 / count 4 for today
    const resLimitsYesterdayCheck = await request(`/api/transfer-limits?accountId=${accountA1._id}`, {
      token: tokenA,
    });
    assert(
      18,
      'Historical transactions across date boundaries do not affect today\'s allowances',
      resLimitsYesterdayCheck.status === 200 &&
        resLimitsYesterdayCheck.data.limits.dailySpent === 92000 &&
        resLimitsYesterdayCheck.data.limits.dailyCount === 4
    );

    // Test 19: Concurrent transfer attempts cannot bypass limits
    // Increase dailyCountLimit to 20 and dailyAmountLimit to 100,000 to test race on remaining 8,000 allowance (92k spent)
    await transferLimitConfigModel.findOneAndUpdate({}, {
      $set: { dailyCountLimit: 20, dailyAmountLimit: 100000 }
    });
    // Alice currently has ₹8,000 remaining daily allowance (92,000 spent of 100,000).
    // Launch 3 parallel transfer requests of ₹5,000 each (only 1 should succeed, 2 should fail with 400).
    const concurrentRequests = [
      request('/api/transactions', {
        method: 'POST',
        token: tokenA,
        body: {
          fromAccount: accountA1._id.toString(),
          toAccount: accountB1._id.toString(),
          amount: 5000,
          idempotencyKey: `tx-concurrent-1-${timestamp}`,
        },
      }),
      request('/api/transactions', {
        method: 'POST',
        token: tokenA,
        body: {
          fromAccount: accountA1._id.toString(),
          toAccount: accountB1._id.toString(),
          amount: 5000,
          idempotencyKey: `tx-concurrent-2-${timestamp}`,
        },
      }),
      request('/api/transactions', {
        method: 'POST',
        token: tokenA,
        body: {
          fromAccount: accountA1._id.toString(),
          toAccount: accountB1._id.toString(),
          amount: 5000,
          idempotencyKey: `tx-concurrent-3-${timestamp}`,
        },
      }),
    ];

    const concurrentResults = await Promise.all(concurrentRequests);
    const successCount = concurrentResults.filter((r) => r.status === 201).length;
    const limitExceededCount = concurrentResults.filter((r) => r.status === 400).length;

    assert(
      19,
      'Concurrent transfer attempts cannot bypass atomic daily limit checks',
      successCount === 1 && limitExceededCount === 2
    );

    // Test 20: Idempotency remains functional
    const res20 = await request('/api/transactions', {
      method: 'POST',
      token: tokenA,
      body: {
        fromAccount: accountA1._id.toString(),
        toAccount: accountB1._id.toString(),
        amount: 20000,
        idempotencyKey: `tx-success-1-${timestamp}`, // Already completed earlier
      },
    });
    assert(
      20,
      'Re-sending completed transaction with same idempotencyKey returns 200 OK',
      res20.status === 200 &&
        res20.data?.message?.toLowerCase().includes('already exists and is completed')
    );

    console.log('\n--- SECURITY & AUDIT / NOTIFICATION TESTS ---\n');

    // Test 21: Customer cannot modify system limit configuration
    const res21 = await request('/api/system/transfer-limits', {
      method: 'PATCH',
      token: tokenA, // Non-system user
      body: {
        perTransactionLimit: 1000000,
      },
    });
    assert(
      21,
      'Ordinary customer cannot modify system transfer limit configuration (403)',
      res21.status === 403
    );

    // Test 22: System user can modify authorized configuration
    const res22 = await request('/api/system/transfer-limits', {
      method: 'PATCH',
      token: systemToken,
      body: {
        perTransactionLimit: 75000,
        dailyAmountLimit: 150000,
        dailyCountLimit: 25,
        beneficiaryCooldownMinutes: 15,
      },
    });
    assert(
      22,
      'System user can update system transfer limit configuration',
      res22.status === 200 &&
        res22.data?.config?.perTransactionLimit === 75000 &&
        res22.data?.config?.dailyAmountLimit === 150000
    );

    // Test 23: Configuration changes are audit logged
    const configAudit = await auditLogModel.findOne({
      action: 'TRANSFER_LIMIT_CONFIG_CHANGED',
      actor: systemUser._id,
    });
    assert(
      23,
      'Transfer limit configuration changes create immutable AuditLog records',
      configAudit !== null &&
        configAudit.resourceType === 'TRANSFER_LIMIT_CONFIG' &&
        configAudit.newState?.perTransactionLimit === 75000
    );

    // Test 24: Beneficiary events create correct audit events
    const beneficiaryCreatedAudit = await auditLogModel.findOne({
      action: 'BENEFICIARY_CREATED',
      actor: customerUserA._id,
    });
    const beneficiaryActivatedAudit = await auditLogModel.findOne({
      action: 'BENEFICIARY_ACTIVATED',
      actor: customerUserA._id,
    });
    const beneficiaryDeactivatedAudit = await auditLogModel.findOne({
      action: 'BENEFICIARY_DEACTIVATED',
      actor: customerUserA._id,
    });
    assert(
      24,
      'Beneficiary lifecycle actions create correct audit events',
      beneficiaryCreatedAudit !== null &&
        beneficiaryActivatedAudit !== null &&
        beneficiaryDeactivatedAudit !== null
    );

    // Test 25: Appropriate beneficiary and limit notifications are generated
    const notifsA = await notificationModel.find({ recipient: customerUserA._id });
    const notifTypesA = notifsA.map((n) => n.type);

    const hasBeneficiaryAddedNotif = notifTypesA.includes('BENEFICIARY_ADDED');
    const hasLimitExceededNotif = notifTypesA.includes('TRANSFER_LIMIT_EXCEEDED');
    const hasTransferBlockedNotif = notifTypesA.includes('TRANSFER_BLOCKED');

    assert(
      25,
      'Appropriate beneficiary and limit notifications are generated for customer',
      hasBeneficiaryAddedNotif && hasLimitExceededNotif && hasTransferBlockedNotif
    );

    // Test 26: No secrets appear in notification metadata
    const testSecretNotif = await notificationModel.create({
      recipient: customerUserA._id,
      type: 'SYSTEM_NOTICE',
      title: 'Secret Test',
      message: 'Testing sanitization',
      metadata: {
        safeField: 'NonSensitiveValue',
      },
    });

    const notifsForStep9 = await notificationModel.find({ recipient: customerUserA._id });
    let secretsFoundInNotifs = false;
    for (const n of notifsForStep9) {
      if (n.metadata && (n.metadata.password || n.metadata.token || n.metadata.jwt || n.metadata.authorization)) {
        secretsFoundInNotifs = true;
        break;
      }
    }
    assert(
      26,
      'Notification metadata is sanitized with no passwords or secrets',
      !secretsFoundInNotifs && testSecretNotif.metadata.safeField === 'NonSensitiveValue'
    );

    // Test 27: No secrets appear in audit metadata
    const auditsForStep9 = await auditLogModel.find({ actor: { $in: [customerUserA._id, systemUser._id] } });
    let secretsFoundInAudits = false;
    for (const a of auditsForStep9) {
      if (a.metadata && (a.metadata.password || a.metadata.token || a.metadata.jwt || a.metadata.authorization)) {
        secretsFoundInAudits = true;
        break;
      }
    }
    assert(
      27,
      'Audit log metadata is sanitized with no passwords or secrets',
      !secretsFoundInAudits
    );

  } catch (err) {
    console.error('Fatal error during Step 9 test execution:', err);
    failedCount++;
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.connection.close();
    console.log('\n==================================================');
    console.log(`STEP 9 TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('==================================================\n');
    if (failedCount > 0) {
      process.exit(1);
    }
  }
}

runTests();

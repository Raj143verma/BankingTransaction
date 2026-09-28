
require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('./src/app');
const userModel = require('./src/models/user.model');
const accountModel = require('./src/models/account.model');
const accountApplicationModel = require('./src/models/accountApplication.model');
const ladgerModel = require('./src/models/ladger.model');
const transactionModel = require('./src/models/transaction.model');

async function runTests() {
  console.log('=== Starting Initial Deposit & Customer Account Details Tests ===');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  const cleanupUserIds = [];

  try {
    // 1. Create Customer "Raj"
    const testEmailRaj = `raj.test.${Date.now()}@example.com`;
    const userRaj = await userModel.create({
      name: 'Raj',
      email: testEmailRaj,
      password: 'Password123!',
      systemUser: false,
    });
    cleanupUserIds.push(userRaj._id);
    const tokenRaj = jwt.sign({ id: userRaj._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    // 2. Create Customer "Priya" (for transfer and isolation tests)
    const testEmailPriya = `priya.test.${Date.now()}@example.com`;
    const userPriya = await userModel.create({
      name: 'Priya',
      email: testEmailPriya,
      password: 'Password123!',
      systemUser: false,
    });
    cleanupUserIds.push(userPriya._id);
    const tokenPriya = jwt.sign({ id: userPriya._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    // 3. Create System Administrator
    const testEmailSys = `sysadmin.test.${Date.now()}@example.com`;
    const userSys = await userModel.create({
      name: 'Central Bank Admin',
      email: testEmailSys,
      password: 'Password123!',
      systemUser: true,
    });
    cleanupUserIds.push(userSys._id);
    const tokenSys = jwt.sign({ id: userSys._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    // 4. Create System User active account
    const sysAccount = await accountModel.create({
      user: userSys._id,
      accountType: 'CURRENT',
      status: 'ACTIVE',
      currency: 'INR',
    });

    console.log('✓ Test users and institutional system account initialized');

    // 5. Customer Raj submits an account opening application with initialDeposit: ₹1,000 and accountType: SAVINGS
    const rajAppPayload = {
      fullName: 'Raj',
      dateOfBirth: '1995-08-15',
      gender: 'MALE',
      mobileNumber: '9876501234',
      email: testEmailRaj,
      address: '42 Marine Line',
      city: 'Mumbai',
      state: 'Maharashtra',
      pinCode: '400020',
      idType: 'PAN',
      idNumber: 'ABCDE5678G',
      accountType: 'SAVINGS',
      currency: 'INR',
      initialDeposit: 1000,
      confirmAccuracy: true,
      agreeTerms: true,
    };

    const submitRes = await fetch(`${baseUrl}/api/account-applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRaj}`,
      },
      body: JSON.stringify(rajAppPayload),
    });

    if (submitRes.status !== 201) {
      throw new Error(`Application submission failed with status ${submitRes.status}`);
    }

    const submitData = await submitRes.json();
    const rajAppId = submitData.application._id;
    console.log(`✓ Customer Raj submitted application (ID: ${rajAppId}, Deposit: ₹1,000, Type: SAVINGS)`);

    // 6. SYSTEM Admin approves the application
    const approveRes = await fetch(`${baseUrl}/api/account-applications/system/${rajAppId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSys}` },
    });

    if (approveRes.status !== 200) {
      const err = await approveRes.json();
      throw new Error(`Approval failed with status ${approveRes.status}: ${JSON.stringify(err)}`);
    }

    const approveData = await approveRes.json();
    const createdAccountId = approveData.account._id;
    console.log(`✓ SYSTEM Admin approved application (Created Account: ${createdAccountId})`);

    // Test 1: Customer can retrieve their own accounts (GET /api/accounts)
    const accountsRes = await fetch(`${baseUrl}/api/accounts`, {
      headers: { Authorization: `Bearer ${tokenRaj}` },
    });
    if (accountsRes.status !== 200) {
      throw new Error(`Test 1 Failed: Expected 200, got ${accountsRes.status}`);
    }
    const accountsData = await accountsRes.json();
    if (!Array.isArray(accountsData.accounts) || accountsData.accounts.length !== 1) {
      throw new Error(`Test 1 Failed: Expected 1 account for Raj, got ${accountsData.accounts.length}`);
    }
    console.log('✓ Test 1 Passed: Customer Raj retrieved own accounts');

    // Test 2: Account response contains required customer and account info
    const rajAcc = accountsData.accounts[0];
    if (
      rajAcc._id !== createdAccountId.toString() ||
      rajAcc.accountType !== 'SAVINGS' ||
      rajAcc.status !== 'ACTIVE' ||
      rajAcc.currency !== 'INR' ||
      !rajAcc.user ||
      rajAcc.user.name !== 'Raj' ||
      rajAcc.user.email !== testEmailRaj
    ) {
      throw new Error(`Test 2 Failed: Account response missing details: ${JSON.stringify(rajAcc)}`);
    }
    console.log(`✓ Test 2 Passed: Account payload contains customer name "${rajAcc.user.name}", accountType "${rajAcc.accountType}", status "${rajAcc.status}"`);

    // Test 3: Approved application created exactly one ACTIVE account
    const dbAccountsCount = await accountModel.countDocuments({ user: userRaj._id });
    if (dbAccountsCount !== 1) {
      throw new Error(`Test 3 Failed: Expected exactly 1 account in DB, found ${dbAccountsCount}`);
    }
    console.log('✓ Test 3 Passed: Exactly one ACTIVE account exists in database');

    // Test 4: Initial deposit is represented in double-entry ledger
    const initialTx = await transactionModel.findOne({
      idempotencyKey: `INITIAL_DEPOSIT_${rajAppId}`,
    });
    if (!initialTx || initialTx.status !== 'COMPLETED' || initialTx.amount !== 1000) {
      throw new Error(`Test 4 Failed: Initial deposit transaction missing or invalid: ${JSON.stringify(initialTx)}`);
    }

    const ledgerEntries = await ladgerModel.find({ transaction: initialTx._id });
    if (ledgerEntries.length !== 2) {
      throw new Error(`Test 4 Failed: Expected 2 ledger entries (DEBIT & CREDIT), found ${ledgerEntries.length}`);
    }
    const debitEntry = ledgerEntries.find((e) => e.type === 'DEBIT');
    const creditEntry = ledgerEntries.find((e) => e.type === 'CREDIT');
    if (!debitEntry || debitEntry.account.toString() !== sysAccount._id.toString() || debitEntry.amount !== 1000) {
      throw new Error('Test 4 Failed: DEBIT ledger entry invalid');
    }
    if (!creditEntry || creditEntry.account.toString() !== createdAccountId.toString() || creditEntry.amount !== 1000) {
      throw new Error('Test 4 Failed: CREDIT ledger entry invalid');
    }
    console.log('✓ Test 4 Passed: Double-entry ledger entries verified (DEBIT System: ₹1,000, CREDIT Customer: ₹1,000)');

    // Test 5: Customer balance derived from ledger equals exactly ₹1,000.00
    const balanceRes = await fetch(`${baseUrl}/api/accounts/balance/${createdAccountId}`, {
      headers: { Authorization: `Bearer ${tokenRaj}` },
    });
    if (balanceRes.status !== 200) {
      throw new Error(`Test 5 Failed: Balance endpoint returned ${balanceRes.status}`);
    }
    const balanceData = await balanceRes.json();
    if (balanceData.balance !== 1000) {
      throw new Error(`Test 5 Failed: Expected derived balance 1000, got ${balanceData.balance}`);
    }
    console.log(`✓ Test 5 Passed: Customer Raj derived ledger balance is ₹${balanceData.balance}.00`);

    // Test 6 & 7: Repeated approval does not create duplicate account or double-credit initial deposit
    const reApproveRes = await fetch(`${baseUrl}/api/account-applications/system/${rajAppId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenSys}` },
    });
    if (reApproveRes.status !== 400) {
      throw new Error(`Test 6 Failed: Re-approval should return 400, got ${reApproveRes.status}`);
    }

    const reBalanceRes = await fetch(`${baseUrl}/api/accounts/balance/${createdAccountId}`, {
      headers: { Authorization: `Bearer ${tokenRaj}` },
    });
    const reBalanceData = await reBalanceRes.json();
    if (reBalanceData.balance !== 1000) {
      throw new Error(`Test 7 Failed: Balance double-credited! Expected 1000, got ${reBalanceData.balance}`);
    }
    console.log('✓ Test 6 & 7 Passed: Duplicate approval rejected, customer balance unchanged at ₹1,000.00');

    // Test 8: Other customer (Priya) cannot view Raj's account or balance
    const priyaBalanceRes = await fetch(`${baseUrl}/api/accounts/balance/${createdAccountId}`, {
      headers: { Authorization: `Bearer ${tokenPriya}` },
    });
    if (priyaBalanceRes.status === 404 || priyaBalanceRes.status === 403) {
      console.log('✓ Test 8 Passed: Priya cannot access Raj’s account balance');
    } else {
      throw new Error(`Test 8 Failed: Expected 404/403 for unauthorized balance view, got ${priyaBalanceRes.status}`);
    }

    // Test 9: Create account for Priya and test peer-to-peer transfer from Raj to Priya
    const priyaAccount = await accountModel.create({
      user: userPriya._id,
      accountType: 'SAVINGS',
      status: 'ACTIVE',
      currency: 'INR',
    });

    const transferRes = await fetch(`${baseUrl}/api/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRaj}`,
      },
      body: JSON.stringify({
        fromAccount: createdAccountId.toString(),
        toAccount: priyaAccount._id.toString(),
        amount: 300,
        idempotencyKey: `TRANSFER_TEST_${Date.now()}`,
      }),
    });

    if (transferRes.status !== 201) {
      const err = await transferRes.json();
      throw new Error(`Test 9 Failed: Transfer failed: ${JSON.stringify(err)}`);
    }
    console.log('✓ Test 9 Passed: Peer-to-peer transfer of ₹300 from Raj to Priya succeeded');

    // Verify Raj balance after transfer: ₹1,000 - ₹300 = ₹700
    const rajPostTxBalanceRes = await fetch(`${baseUrl}/api/accounts/balance/${createdAccountId}`, {
      headers: { Authorization: `Bearer ${tokenRaj}` },
    });
    const rajPostTxBalance = await rajPostTxBalanceRes.json();
    if (rajPostTxBalance.balance !== 700) {
      throw new Error(`Test 9 Failed: Expected Raj balance 700, got ${rajPostTxBalance.balance}`);
    }

    // Verify Priya balance after transfer: ₹0 + ₹300 = ₹300
    const priyaPostTxBalanceRes = await fetch(`${baseUrl}/api/accounts/balance/${priyaAccount._id}`, {
      headers: { Authorization: `Bearer ${tokenPriya}` },
    });
    const priyaPostTxBalance = await priyaPostTxBalanceRes.json();
    if (priyaPostTxBalance.balance !== 300) {
      throw new Error(`Test 9 Failed: Expected Priya balance 300, got ${priyaPostTxBalance.balance}`);
    }
    console.log('✓ Test 9b Passed: Derived balances updated accurately (Raj: ₹700, Priya: ₹300)');

    // Test 10: Existing System Fund Management continues working
    const sysFundRes = await fetch(`${baseUrl}/api/transactions/system/initialize-funds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenSys}`,
      },
      body: JSON.stringify({
        toAccount: priyaAccount._id.toString(),
        amount: 500,
        idempotencyKey: `SYS_FUND_TEST_${Date.now()}`,
      }),
    });
    if (sysFundRes.status !== 201) {
      throw new Error('Test 10 Failed: System fund initialization failed');
    }
    console.log('✓ Test 10 Passed: System Fund Management works without regression');

    console.log('\n===============================================================');
    console.log('ALL INITIAL DEPOSIT & CUSTOMER ACCOUNT DETAILS TESTS PASSED!');
    console.log('===============================================================\n');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('Test Execution Failed:', err);
  process.exit(1);
});

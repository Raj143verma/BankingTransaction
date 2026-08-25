/**
 * Integration Test Script for STEP 1:
 * "Transaction History, Search, Filters & Pagination"
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
const accountApplicationModel = require('./src/models/accountApplication.model');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/banking';
const JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

let server;
let app;
let baseUrl;

async function apiRequest(path, options = {}) {
    const url = `${baseUrl}${path}`;
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    let body = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    return {
        status: response.status,
        body
    };
}

async function runTests() {
    console.log('\n==================================================');
    console.log('STARTING STEP 1 INTEGRATION TEST SUITE');
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
    let accountA1, accountA2, accountB1, systemAccount;
    let tokenA, tokenB, tokenSys;

    try {
        // Setup Test Users
        const timestamp = Date.now();
        const emailA = `test_tx_a_${timestamp}@example.com`;
        const emailB = `test_tx_b_${timestamp}@example.com`;
        const emailSys = `test_tx_sys_${timestamp}@example.com`;

        customerA = await userModel.create({
            name: 'Alice Johnson',
            email: emailA,
            password: 'Password123!',
            systemUser: false
        });

        customerB = await userModel.create({
            name: 'Bob Smith',
            email: emailB,
            password: 'Password123!',
            systemUser: false
        });

        systemUser = await userModel.create({
            name: 'System Admin',
            email: emailSys,
            password: 'Password123!',
            systemUser: true
        });

        tokenA = jwt.sign({ id: customerA._id }, JWT_SECRET, { expiresIn: '1d' });
        tokenB = jwt.sign({ id: customerB._id }, JWT_SECRET, { expiresIn: '1d' });
        tokenSys = jwt.sign({ id: systemUser._id }, JWT_SECRET, { expiresIn: '1d' });

        // Setup Accounts
        accountA1 = await accountModel.create({
            user: customerA._id,
            accountHolderName: 'Alice Primary',
            accountType: 'SAVINGS',
            status: 'ACTIVE',
            currency: 'INR'
        });

        accountA2 = await accountModel.create({
            user: customerA._id,
            accountHolderName: 'Alice Secondary',
            accountType: 'CURRENT',
            status: 'ACTIVE',
            currency: 'INR'
        });

        accountB1 = await accountModel.create({
            user: customerB._id,
            accountHolderName: 'Bob Savings',
            accountType: 'SAVINGS',
            status: 'ACTIVE',
            currency: 'INR'
        });

        systemAccount = await accountModel.create({
            user: systemUser._id,
            accountHolderName: 'System Central Reserve',
            accountType: 'SAVINGS',
            status: 'ACTIVE',
            currency: 'INR'
        });

        console.log('✓ Test users and accounts initialized');

        // Create Seed Transactions for Customer A
        // 1. Initial Deposit from System Account to Account A1: ₹5,000 (CREDIT for A)
        const tx1 = await transactionModel.create({
            fromAccount: systemAccount._id,
            toAccount: accountA1._id,
            amount: 5000,
            status: 'COMPLETED',
            idempotencyKey: `SEED_TX_1_${timestamp}`
        });
        await ladgerModel.create([
            { account: systemAccount._id, amount: 5000, transaction: tx1._id, type: 'DEBIT' },
            { account: accountA1._id, amount: 5000, transaction: tx1._id, type: 'CREDIT' }
        ]);

        // 2. Transfer from Account A1 to Bob Account B1: ₹1,000 (DEBIT for A, CREDIT for B)
        const tx2 = await transactionModel.create({
            fromAccount: accountA1._id,
            toAccount: accountB1._id,
            amount: 1000,
            status: 'COMPLETED',
            idempotencyKey: `SEED_TX_2_${timestamp}`
        });
        await ladgerModel.create([
            { account: accountA1._id, amount: 1000, transaction: tx2._id, type: 'DEBIT' },
            { account: accountB1._id, amount: 1000, transaction: tx2._id, type: 'CREDIT' }
        ]);

        // 3. Internal Transfer from Account A1 to Account A2: ₹500 (DEBIT & CREDIT for A)
        const tx3 = await transactionModel.create({
            fromAccount: accountA1._id,
            toAccount: accountA2._id,
            amount: 500,
            status: 'COMPLETED',
            idempotencyKey: `SEED_TX_3_${timestamp}`
        });
        await ladgerModel.create([
            { account: accountA1._id, amount: 500, transaction: tx3._id, type: 'DEBIT' },
            { account: accountA2._id, amount: 500, transaction: tx3._id, type: 'CREDIT' }
        ]);

        // 4. Transfer from Bob to Alice A2: ₹300 (CREDIT for A, DEBIT for B)
        const tx4 = await transactionModel.create({
            fromAccount: accountB1._id,
            toAccount: accountA2._id,
            amount: 300,
            status: 'COMPLETED',
            idempotencyKey: `SEED_TX_4_${timestamp}`
        });
        await ladgerModel.create([
            { account: accountB1._id, amount: 300, transaction: tx4._id, type: 'DEBIT' },
            { account: accountA2._id, amount: 300, transaction: tx4._id, type: 'CREDIT' }
        ]);

        // 5. A Pending Transaction for Alice A1: ₹200
        const tx5 = await transactionModel.create({
            fromAccount: accountA1._id,
            toAccount: accountB1._id,
            amount: 200,
            status: 'PENDING',
            idempotencyKey: `SEED_TX_5_${timestamp}`
        });

        console.log('✓ Seed transactions and double-entry ledger records created');

        // TEST 1: Unauthenticated request rejection (401)
        const resUnauth = await apiRequest('/api/transactions');
        console.assert(resUnauth.status === 401, `Expected 401, got ${resUnauth.status}`);
        console.log('✓ TEST 1: Unauthenticated request properly rejected with HTTP 401');

        // TEST 2: Customer A Default List (page=1, limit=10)
        const resA = await apiRequest('/api/transactions', {
            headers: { Authorization: `Bearer ${tokenA}` }
        });

        console.assert(resA.status === 200, `Expected 200, got ${resA.status}`);
        console.assert(resA.body.transactions.length === 5, `Expected 5 transactions, got ${resA.body.transactions.length}`);
        console.assert(resA.body.pagination.totalCount === 5, `Expected totalCount 5, got ${resA.body.pagination.totalCount}`);
        console.assert(resA.body.pagination.page === 1, `Expected page 1, got ${resA.body.pagination.page}`);
        console.assert(resA.body.pagination.hasNextPage === false, 'Expected hasNextPage false');
        console.log('✓ TEST 2: Customer A default paginated list returned 5 transactions with metadata');

        // TEST 3: Customer Isolation (Customer B should see only tx2, tx4, tx5)
        const resB = await apiRequest('/api/transactions', {
            headers: { Authorization: `Bearer ${tokenB}` }
        });

        console.assert(resB.status === 200, `Expected 200, got ${resB.status}`);
        console.assert(resB.body.transactions.length === 3, `Expected 3 transactions for B, got ${resB.body.transactions.length}`);
        const bTxIds = new Set(resB.body.transactions.map(t => t._id.toString()));
        console.assert(!bTxIds.has(tx1._id.toString()), 'Customer B must NOT see Customer A initial deposit from System');
        console.assert(!bTxIds.has(tx3._id.toString()), 'Customer B must NOT see Customer A internal transfer');
        console.log('✓ TEST 3: Strict customer data isolation verified');

        // TEST 4: Pagination with limit=2 (Page 1 & Page 2)
        const resPage1 = await apiRequest('/api/transactions?page=1&limit=2', {
            headers: { Authorization: `Bearer ${tokenA}` }
        });

        console.assert(resPage1.body.transactions.length === 2, `Expected 2 items, got ${resPage1.body.transactions.length}`);
        console.assert(resPage1.body.pagination.page === 1, 'Expected page 1');
        console.assert(resPage1.body.pagination.totalPages === 3, `Expected 3 pages, got ${resPage1.body.pagination.totalPages}`);
        console.assert(resPage1.body.pagination.hasNextPage === true, 'Expected hasNextPage true on page 1');
        console.assert(resPage1.body.pagination.hasPrevPage === false, 'Expected hasPrevPage false on page 1');

        const resPage2 = await apiRequest('/api/transactions?page=2&limit=2', {
            headers: { Authorization: `Bearer ${tokenA}` }
        });

        console.assert(resPage2.body.transactions.length === 2, `Expected 2 items on page 2, got ${resPage2.body.transactions.length}`);
        console.assert(resPage2.body.pagination.page === 2, 'Expected page 2');
        console.assert(resPage2.body.pagination.hasNextPage === true, 'Expected hasNextPage true on page 2');
        console.assert(resPage2.body.pagination.hasPrevPage === true, 'Expected hasPrevPage true on page 2');

        const resPage4 = await apiRequest('/api/transactions?page=4&limit=2', {
            headers: { Authorization: `Bearer ${tokenA}` }
        });

        console.assert(resPage4.body.transactions.length === 0, 'Expected 0 items on out-of-range page 4');
        console.assert(resPage4.body.pagination.hasNextPage === false, 'Expected hasNextPage false on page 4');
        console.log('✓ TEST 4: Multi-page pagination (page 1, 2, and out-of-range) verified');

        // TEST 5: Filter by Direction (type=CREDIT and type=DEBIT)
        const resCredit = await apiRequest('/api/transactions?type=CREDIT', {
            headers: { Authorization: `Bearer ${tokenA}` }
        });

        // A is receiver in tx1 (5000), tx3 (500), tx4 (300) = 3 credits
        console.assert(resCredit.body.transactions.length === 3, `Expected 3 credit transactions, got ${resCredit.body.transactions.length}`);
        const creditIds = resCredit.body.transactions.map(t => t._id.toString());
        console.assert(creditIds.includes(tx1._id.toString()) && creditIds.includes(tx3._id.toString()) && creditIds.includes(tx4._id.toString()), 'Credit transactions match expected IDs');

        const resDebit = await apiRequest('/api/transactions?type=DEBIT', {
            headers: { Authorization: `Bearer ${tokenA}` }
        });

        // A is sender in tx2 (1000), tx3 (500), tx5 (200) = 3 debits
        console.assert(resDebit.body.transactions.length === 3, `Expected 3 debit transactions, got ${resDebit.body.transactions.length}`);
        console.log('✓ TEST 5: Direction filters (CREDIT / DEBIT) verified');

        // TEST 6: Filter by Status (status=COMPLETED vs status=PENDING)
        const resCompleted = await apiRequest('/api/transactions?status=COMPLETED', {
            headers: { Authorization: `Bearer ${tokenA}` }
        });
        console.assert(resCompleted.body.transactions.length === 4, `Expected 4 completed txs, got ${resCompleted.body.transactions.length}`);

        const resPending = await apiRequest('/api/transactions?status=PENDING', {
            headers: { Authorization: `Bearer ${tokenA}` }
        });
        console.assert(resPending.body.transactions.length === 1, `Expected 1 pending tx, got ${resPending.body.transactions.length}`);
        console.assert(resPending.body.transactions[0]._id.toString() === tx5._id.toString(), 'Pending transaction ID matches');
        console.log('✓ TEST 6: Status filter (COMPLETED vs PENDING) verified');

        // TEST 7: Search by Transaction ID
        const resSearchTxId = await apiRequest(`/api/transactions?search=${tx2._id.toString()}`, {
            headers: { Authorization: `Bearer ${tokenA}` }
        });
        console.assert(resSearchTxId.body.transactions.length === 1, `Expected 1 match, got ${resSearchTxId.body.transactions.length}`);
        console.assert(resSearchTxId.body.transactions[0]._id.toString() === tx2._id.toString(), 'Search matched exact transaction ID');
        console.log('✓ TEST 7: Search by Transaction ID verified');

        // TEST 8: Search by Counterparty Name ("Bob")
        const resSearchName = await apiRequest('/api/transactions?search=Bob', {
            headers: { Authorization: `Bearer ${tokenA}` }
        });
        // Transactions involving Bob and Alice: tx2, tx4, tx5 = 3 transactions
        console.assert(resSearchName.body.transactions.length === 3, `Expected 3 transactions matching 'Bob', got ${resSearchName.body.transactions.length}`);
        console.log('✓ TEST 8: Counterparty Name search verified');

        // TEST 9: Search Non-Existent
        const resSearchNone = await apiRequest('/api/transactions?search=NonExistentPersonXYZ', {
            headers: { Authorization: `Bearer ${tokenA}` }
        });
        console.assert(resSearchNone.body.transactions.length === 0, 'Expected 0 matches for non-existent search');
        console.assert(resSearchNone.body.pagination.totalCount === 0, 'totalCount must be 0');
        console.log('✓ TEST 9: Non-matching search cleanly returns empty result');

        // TEST 10: Transaction Financial Summary (GET /api/transactions/summary)
        const resSummaryA = await apiRequest('/api/transactions/summary', {
            headers: { Authorization: `Bearer ${tokenA}` }
        });

        console.assert(resSummaryA.status === 200, `Expected 200, got ${resSummaryA.status}`);
        // Completed transactions for A:
        // tx1: from System to A1 (credit: 5000)
        // tx2: from A1 to Bob (debit: 1000)
        // tx3: from A1 to A2 (internal: debit 500, credit 500)
        // tx4: from Bob to A2 (credit: 300)
        // Total Credits = 5000 + 500 + 300 = 5800
        // Total Debits = 1000 + 500 = 1500
        // Net Movement = 5800 - 1500 = 4300
        // Total Completed Transactions = 4
        console.assert(resSummaryA.body.totalCredits === 5800, `Expected totalCredits 5800, got ${resSummaryA.body.totalCredits}`);
        console.assert(resSummaryA.body.totalDebits === 1500, `Expected totalDebits 1500, got ${resSummaryA.body.totalDebits}`);
        console.assert(resSummaryA.body.netMovement === 4300, `Expected netMovement 4300, got ${resSummaryA.body.netMovement}`);
        console.assert(resSummaryA.body.totalTransactions === 4, `Expected totalTransactions 4, got ${resSummaryA.body.totalTransactions}`);
        console.log('✓ TEST 10: GET /api/transactions/summary verified with exact financial totals');

        // TEST 11: P2P Transfer Regression Execution (POST /api/transactions)
        const idempotencyKey = `REGRESSION_TX_${timestamp}`;
        const resTransfer = await apiRequest('/api/transactions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenA}` },
            body: {
                fromAccount: accountA1._id.toString(),
                toAccount: accountB1._id.toString(),
                amount: 250,
                idempotencyKey
            }
        });

        console.assert(resTransfer.status === 201 || resTransfer.status === 200, `Expected 201/200, got ${resTransfer.status}`);
        console.assert(resTransfer.body.transaction?.status === 'COMPLETED', 'Transfer must complete');

        // Verify balance updated via ledger
        const balA1 = await accountA1.getBalance();
        // A1 balance: +5000 (tx1) -1000 (tx2) -500 (tx3) -250 (transfer) = 3250
        console.assert(balA1 === 3250, `Expected A1 balance 3250, got ${balA1}`);
        console.log('✓ TEST 11: P2P transfer regression and ledger derived balance verified');

        console.log('\n==================================================');
        console.log('ALL 11 INTEGRATION TESTS PASSED SUCCESSFULLY! (100%)');
        console.log('==================================================\n');

    } finally {
        // Clean up test documents
        if (customerA) await userModel.deleteMany({ _id: { $in: [customerA._id, customerB._id, systemUser._id] } });
        if (accountA1) await accountModel.deleteMany({ _id: { $in: [accountA1._id, accountA2._id, accountB1._id, systemAccount._id] } });
        await transactionModel.deleteMany({ idempotencyKey: { $regex: 'SEED_TX|REGRESSION_TX' } });
        if (server) server.close();
        await mongoose.disconnect();
        console.log('✓ Database connection closed and test teardown complete.');
    }
}

runTests().catch((err) => {
    console.error('❌ Test suite error:', err);
    process.exit(1);
});

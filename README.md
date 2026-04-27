A production-grade banking backend system built with Node.js & Express — covering authentication, account management, transactions, ledger handling, and full end-to-end financial data flow.

📌 Overview
BankCore API is a real-world banking backend system that simulates how modern financial institutions handle core banking operations. This project goes beyond a typical tutorial — it's architected to reflect how banks actually process money, maintain ledgers, and secure user data.
Whether you're learning backend engineering or exploring fintech systems, this project gives you a deep, practical understanding of:

How credit and debit operations are processed atomically
How a double-entry ledger ensures data consistency and auditability
How authentication and authorization protect sensitive financial routes
How transactions flow end-to-end in a production-style backend


✨ Features
ModuleDescription
🔐 AuthenticationJWT-based login, registration, and route protection
👤 Account ManagementCreate and manage bank accounts per user
💸 TransactionsDeposit, withdrawal, and fund transfer operations
📒 Ledger SystemDouble-entry bookkeeping for financial accuracy
🛡️ SecurityPassword hashing, token validation, and middleware guards
🧾 Transaction HistoryFull audit trail per account
⚠️ Error HandlingCentralized, consistent error responses



🗂️ Project Structure
bankcore-api/
├── src/
│   ├── config/          # DB and environment config
│   ├── controllers/     # Route handler logic
│   │   ├── auth.controller.js
│   │   ├── account.controller.js
│   │   └── transaction.controller.js
│   ├── middleware/      # Auth guards, validators
│   ├── models/          # Database models (User, Account, Transaction, Ledger)
│   ├── routes/          # Express route definitions
│   ├── services/        # Core business logic
│   │   ├── ledger.service.js
│   │   └── transaction.service.js
│   └── app.js           # Express app entry point
├── .env.example
├── package.json
└── README.md


🔄 How a Transaction Works (End-to-End)
Client Request
     │
     ▼
[Auth Middleware] ── invalid token ──► 401 Unauthorized
     │
     ▼
[Transaction Controller]
     │
     ▼
[Transaction Service]
  ├── Validate account balance
  ├── Begin DB Transaction
  ├── Apply Debit / Credit
  ├── Record Ledger Entries (Double-Entry)
  └── Commit or Rollback
     │
     ▼
[Response] ── success / failure


Every financial operation is:

Validated — sufficient balance, valid accounts
Atomic — wrapped in a database transaction (all-or-nothing)
Recorded — both sides of the entry logged in the ledger
Auditable — complete history always available


🚀 Getting Started
Prerequisites

Node.js v18+
npm or yarn
MongoDB / PostgreSQL (based on your setup)


Installation
bash# 1. Clone the repository
git clone https://github.com/your-username/bankcore-api.git
cd bankcore-api

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env
# Fill in your DB URI, JWT_SECRET, PORT, etc.

# 4. Start the server
npm run dev


🛣️ API Endpoints
🔐 Auth Routes
POST   /api/auth/register     → Register a new user
POST   /api/auth/login        → Login and receive JWT token
👤 Account Routes (Protected)
POST   /api/accounts          → Create a new bank account
GET    /api/accounts          → Get all accounts for logged-in user
GET    /api/accounts/:id      → Get a specific account
💸 Transaction Routes (Protected)
POST   /api/transactions/deposit      → Deposit money into account
POST   /api/transactions/withdraw     → Withdraw money from account
POST   /api/transactions/transfer     → Transfer funds between accounts
GET    /api/transactions/:accountId   → Get transaction history
📒 Ledger Routes (Protected)
GET    /api/ledger/:accountId         → View ledger entries for an account



📒 Ledger — The Heart of the System
This system implements a double-entry bookkeeping model — the same principle used in real banking:

Every transaction results in at least two ledger entries: one debit and one credit.

TRANSFER: Account A → Account B (₹5,000)

Ledger Entry 1:  Account A  |  DEBIT   |  ₹5,000
Ledger Entry 2:  Account B  |  CREDIT  |  ₹5,000
This guarantees:

✅ The books always balance
✅ Full audit trail exists for every operation
✅ No money is created or destroyed in transit


🔐 Security Design

Passwords are hashed using bcrypt before storage — never stored in plain text
JWT tokens are signed with a secret key and expire after a set duration
Protected routes require a valid Bearer token in the Authorization header
Input validation prevents malformed data from reaching business logic


🧪 Running Tests
bashnpm test
Tests cover:

Auth flow (register, login, token validation)
Account creation and retrieval
Deposit, withdrawal, and transfer logic
Ledger consistency checks


 What You'll Learn From This Project

Designing a layered backend architecture (Controller → Service → Model)
Implementing JWT authentication in a real API
Building atomic database transactions for financial safety
Understanding double-entry accounting in code
Handling errors and edge cases in financial operations
Structuring a production-ready Node.js project




🛠️ Tech Stack
LayerTechnologyRuntimeNode.jsFrameworkExpress.jsAuthenticationJWT + bcryptDatabaseMongoDB / PostgreSQLValidationexpress-validator / JoiEnvironmentdotenv



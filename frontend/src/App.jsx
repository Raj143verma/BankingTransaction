import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { PublicRoute } from './routes/PublicRoute';
import { AppLayout } from './layouts/AppLayout';
import { AuthLayout } from './layouts/AuthLayout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Accounts } from './pages/Accounts';
import { AccountOpening } from './pages/AccountOpening';
import { AccountApplications } from './pages/AccountApplications';
import { Transactions } from './pages/Transactions';
import { SystemFunds } from './pages/SystemFunds';
import { SystemApplications } from './pages/SystemApplications';
import { SystemAccounts } from './pages/SystemAccounts';
import { SystemTransactions } from './pages/SystemTransactions';
import { SystemAuditLogs } from './pages/SystemAuditLogs';
import { SecuritySettings } from './pages/SecuritySettings';
import { AccountStatement } from './pages/AccountStatement';
import { SystemReconciliation } from './pages/SystemReconciliation';
import { Beneficiaries } from './pages/Beneficiaries';
import { NotFound } from './pages/NotFound';

export function App() {
  return (
    <Routes>
      {/* Root redirect to Dashboard */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Public Authentication Routes */}
      <Route element={<PublicRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>
      </Route>

      {/* Protected Application Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/accounts/:id/statement" element={<AccountStatement />} />
          <Route path="/accounts/open" element={<AccountOpening />} />
          <Route path="/accounts/applications" element={<AccountApplications />} />
          <Route path="/beneficiaries" element={<Beneficiaries />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/security" element={<SecuritySettings />} />
          <Route path="/system/security" element={<SecuritySettings />} />
          <Route path="/system/accounts" element={<SystemAccounts />} />
          <Route path="/system/accounts/:id/statement" element={<AccountStatement />} />
          <Route path="/system/transactions" element={<SystemTransactions />} />
          <Route path="/system/audit-logs" element={<SystemAuditLogs />} />
          <Route path="/system/reconciliation" element={<SystemReconciliation />} />
          <Route path="/system/funds" element={<SystemFunds />} />
          <Route path="/system/applications" element={<SystemApplications />} />
        </Route>
      </Route>


      {/* 404 Catch-All */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;

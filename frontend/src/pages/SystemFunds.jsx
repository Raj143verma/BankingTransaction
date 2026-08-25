import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { accountService } from '../services/account.service';
import { systemFundService } from '../services/system-fund.service';
import { formatCurrency, formatDate } from '../utils/formatters';

export function SystemFunds() {
  const { user } = useAuth();

  const isSystemUser = user?.systemUser === true;

  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsError, setAccountsError] = useState('');

  const [toAccount, setToAccount] = useState('');
  const [targetBalance, setTargetBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState(false);

  const [amount, setAmount] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [lastReceipt, setLastReceipt] = useState(null);

  // Load derived balance for selected destination customer account
  const loadTargetBalance = useCallback(async (accountId) => {
    if (!accountId) {
      setTargetBalance(null);
      return;
    }

    setLoadingBalance(true);
    setBalanceError(false);

    try {
      const data = await accountService.getAccountBalance(accountId);
      setTargetBalance(typeof data?.balance === 'number' ? data.balance : 0);
    } catch {
      setBalanceError(true);
      setTargetBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  // Fetch available customer accounts (system-user only)
  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setAccountsError('');

    try {
      const data = await accountService.getCustomerAccounts();
      const accountList = Array.isArray(data?.accounts) ? data.accounts : [];
      setAccounts(accountList);

      const activeAccounts = accountList.filter((a) => a.status === 'ACTIVE');
      if (activeAccounts.length > 0) {
        setToAccount((prev) => {
          const currentValid = activeAccounts.some((a) => a._id === prev);
          return currentValid ? prev : activeAccounts[0]._id;
        });
      } else {
        setToAccount('');
      }
    } catch (err) {
      if (err.response?.data?.message) {
        setAccountsError(err.response.data.message);
      } else if (err.request && !err.response) {
        setAccountsError('Unable to connect to the server. Please check your network connection.');
      } else {
        setAccountsError('Failed to load customer accounts. Please try again.');
      }
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    if (isSystemUser) {
      loadAccounts();
    } else {
      setLoadingAccounts(false);
    }
  }, [isSystemUser, loadAccounts]);

  // When selected destination account changes, load its derived balance
  useEffect(() => {
    if (toAccount && /^[0-9a-fA-F]{24}$/.test(toAccount)) {
      loadTargetBalance(toAccount);
    } else {
      setTargetBalance(null);
    }
  }, [toAccount, loadTargetBalance]);

  // Client-side validation
  const validateForm = () => {
    const errors = {};
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    const trimmedTo = toAccount.trim();

    if (!trimmedTo) {
      errors.toAccount = 'Destination customer account is required';
    } else if (!objectIdRegex.test(trimmedTo)) {
      errors.toAccount = 'Destination account must be a valid 24-character hexadecimal ID';
    }

    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount)) {
      errors.amount = 'Funding amount is required and must be a valid number';
    } else if (numAmount <= 0) {
      errors.amount = 'Funding amount must be a finite number greater than zero';
    }

    return errors;
  };

  const handleInputChange = (field, value) => {
    if (field === 'toAccount') {
      setToAccount(value);
    } else if (field === 'amount') {
      setAmount(value);
    }

    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (apiError) {
      setApiError('');
    }
  };

  const handleInitializeFunds = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setApiError('');
    const validationErrors = validateForm();

    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);

    const idempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'sys_fund_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);

    try {
      const payload = {
        toAccount: toAccount.trim(),
        amount: Number(amount),
        idempotencyKey,
      };

      const response = await systemFundService.initializeFunds(payload);
      const tx = response.transaction;

      if (tx) {
        setLastReceipt(tx);
      }

      // Refresh destination account balance
      await loadTargetBalance(toAccount.trim());

      // Reset amount input
      setAmount('');
      setFormErrors({});
    } catch (err) {
      if (err.response?.status === 403) {
        setApiError('Forbidden: Only authorized system users can initialize funds.');
      } else if (err.response?.data?.message) {
        setApiError(err.response.data.message);
      } else if (err.request && !err.response) {
        setApiError('Unable to reach the server. Please check your network connection and try again.');
      } else {
        setApiError('Fund initialization failed. Please verify account details and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // If user is not a system user, display Access Denied security state
  if (!isSystemUser) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1>System Fund Management</h1>
          <p>Restricted central bank ledger fund allocation module.</p>
        </div>

        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛡️</div>
            <h2>Access Denied</h2>
            <p className="placeholder-text" style={{ maxWidth: '460px', margin: '0.75rem auto 1.5rem' }}>
              You do not have system administrator privileges to access this module. Fund
              initialization is strictly restricted to authorized system users.
            </p>
            <Link to="/dashboard" className="btn btn-primary">
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const activeAccounts = accounts.filter((a) => a.status === 'ACTIVE');
  const selectedAccountObj = accounts.find((a) => a._id === toAccount);

  return (
    <div className="page-container">
      <div className="page-header page-header-row">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <h1>System Fund Management</h1>
            <span className="badge badge-system">ADMIN</span>
          </div>
          <p>Allocate central bank initial funds directly into customer accounts via double-entry ledger.</p>
        </div>
      </div>

      {apiError && (
        <div className="alert alert-error" role="alert">
          {apiError}
        </div>
      )}

      {accountsError && (
        <div className="alert alert-error" role="alert">
          <span>{accountsError}</span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            style={{ marginLeft: '1rem' }}
            onClick={loadAccounts}
          >
            Retry
          </button>
        </div>
      )}

      {loadingAccounts ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <span className="spinner-inline" style={{ width: '28px', height: '28px' }} />
            <p style={{ marginTop: '1rem', color: '#64748b' }}>Loading customer accounts...</p>
          </div>
        </div>
      ) : activeAccounts.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
            <div style={{ fontSize: '2.75rem', marginBottom: '0.75rem' }}>👥</div>
            <h3>No Customer Accounts Available</h3>
            <p className="placeholder-text" style={{ maxWidth: '440px', margin: '0.5rem auto 1.5rem' }}>
              No active customer deposit accounts were found in the system. A customer must register and
              open an account before initial funds can be allocated.
            </p>
            <button type="button" className="btn btn-secondary" onClick={loadAccounts}>
              ↻ Refresh Accounts
            </button>
          </div>
        </div>
      ) : (
        <div className="system-funds-layout">
          {/* Fund Initialization Form Card */}
          <div className="card">
            <div className="card-header">
              <h3>Initialize Customer Funds</h3>
            </div>

            <div className="card-body">
              <form onSubmit={handleInitializeFunds} noValidate>
                {/* Customer Account Selector */}
                <div className="form-group">
                  <label htmlFor="accountSelect">Select Customer Account</label>
                  <select
                    id="accountSelect"
                    value={activeAccounts.some((a) => a._id === toAccount) ? toAccount : ''}
                    onChange={(e) => handleInputChange('toAccount', e.target.value)}
                    disabled={isSubmitting}
                  >
                    <option value="" disabled>-- Select a Customer Account --</option>
                    {activeAccounts.map((acc) => (
                      <option key={acc._id} value={acc._id}>
                        {acc.user?.name ? `${acc.user.name} (${acc.user.email}) - ` : ''}
                        {acc._id} ({acc.currency || 'INR'} - {acc.status})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Destination Account ID (Input / Confirm) */}
                <div className="form-group">
                  <label htmlFor="toAccount">Destination Account ID (Credit)</label>
                  <input
                    id="toAccount"
                    name="toAccount"
                    type="text"
                    placeholder="24-character hexadecimal ObjectId"
                    value={toAccount}
                    onChange={(e) => handleInputChange('toAccount', e.target.value)}
                    disabled={isSubmitting}
                    className={formErrors.toAccount ? 'input-error' : ''}
                    autoComplete="off"
                  />
                  {formErrors.toAccount && (
                    <span className="form-error">{formErrors.toAccount}</span>
                  )}
                  <span className="form-hint">
                    Target account must be an ACTIVE customer deposit account.
                  </span>
                </div>

                {/* Amount Input */}
                <div className="form-group">
                  <label htmlFor="amount">Funding Amount</label>
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    step="any"
                    min="1"
                    placeholder="e.g. 10000"
                    value={amount}
                    onChange={(e) => handleInputChange('amount', e.target.value)}
                    disabled={isSubmitting}
                    className={formErrors.amount ? 'input-error' : ''}
                  />
                  {formErrors.amount && (
                    <span className="form-error">{formErrors.amount}</span>
                  )}
                  <span className="form-hint">
                    Initial funds will be debited from system reserves and credited to the target ledger.
                  </span>
                </div>

                <div className="security-notice" style={{ margin: '1rem 0' }}>
                  <strong>🔒 Authorization Notice</strong>
                  Requests are authenticated via system credentials and atomically committed to the double-entry ledger.
                </div>

                {/* Submit Action */}
                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="spinner-inline" /> Initializing Funds...
                    </>
                  ) : (
                    'Initialize Funds'
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Destination Account Overview & Success Receipt */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Live Success Receipt */}
            {lastReceipt && (
              <div className="receipt-card">
                <div className="receipt-header">
                  <span className="receipt-title">✓ Fund Initialization Successful</span>
                  <span className="badge badge-success">{lastReceipt.status || 'COMPLETED'}</span>
                </div>

                <div className="receipt-details">
                  <div className="receipt-row">
                    <span className="label">Amount:</span>
                    <span className="value amount">{formatCurrency(lastReceipt.amount)}</span>
                  </div>
                  <div className="receipt-row">
                    <span className="label">Destination:</span>
                    <span className="value mono">{lastReceipt.toAccount}</span>
                  </div>
                  <div className="receipt-row">
                    <span className="label">Status:</span>
                    <span className="value">{lastReceipt.status || 'COMPLETED'}</span>
                  </div>
                  <div className="receipt-row">
                    <span className="label">Transaction ID:</span>
                    <span className="value mono">{lastReceipt._id}</span>
                  </div>
                  <div className="receipt-row">
                    <span className="label">Date:</span>
                    <span className="value">{formatDate(lastReceipt.createdAt)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Target Account Live Details Card */}
            <div className="account-preview-card">
              <div className="preview-header">
                <h4>Customer Account Status</h4>
                {selectedAccountObj ? (
                  <span className="badge badge-success">{selectedAccountObj.status || 'ACTIVE'}</span>
                ) : (
                  <span className="badge badge-neutral">SPECIFIED ID</span>
                )}
              </div>

              <div className="preview-details">
                <div className="preview-row">
                  <span className="label">Customer Name:</span>
                  <span className="value">{selectedAccountObj?.user?.name || '—'}</span>
                </div>
                <div className="preview-row">
                  <span className="label">Customer Email:</span>
                  <span className="value">{selectedAccountObj?.user?.email || '—'}</span>
                </div>
                <div className="preview-row">
                  <span className="label">Account ID:</span>
                  <span className="value mono">{toAccount || 'None selected'}</span>
                </div>
                <div className="preview-row">
                  <span className="label">Currency:</span>
                  <span className="value">{selectedAccountObj?.currency || 'INR'}</span>
                </div>
                <div className="preview-row">
                  <span className="label">Current Ledger Balance:</span>
                  {loadingBalance ? (
                    <span className="value" style={{ color: '#64748b', fontSize: '0.875rem' }}>
                      <span className="spinner-inline" /> Loading...
                    </span>
                  ) : balanceError ? (
                    <span className="value" style={{ color: '#dc2626', fontSize: '0.8125rem' }}>
                      Unavailable{' '}
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#0284c7',
                          textDecoration: 'underline',
                        }}
                        onClick={() => loadTargetBalance(toAccount)}
                      >
                        Retry
                      </button>
                    </span>
                  ) : targetBalance !== null ? (
                    <span className="value balance">{formatCurrency(targetBalance)}</span>
                  ) : (
                    <span className="value" style={{ color: '#94a3b8' }}>—</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SystemFunds;

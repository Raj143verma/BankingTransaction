import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { accountService } from '../services/account.service';
import { transactionService } from '../services/transaction.service';
import { formatCurrency } from '../utils/formatters';

export function Accounts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [balances, setBalances] = useState({});
  const [balancesLoading, setBalancesLoading] = useState({});
  const [balancesError, setBalancesError] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Step 10: Cash Deposit & Withdrawal Modal State
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [activeModalAccount, setActiveModalAccount] = useState(null);
  const [amountInput, setAmountInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState(null);

  const fetchBalanceForAccount = useCallback(async (accountId) => {
    setBalancesLoading((prev) => ({ ...prev, [accountId]: true }));
    setBalancesError((prev) => ({ ...prev, [accountId]: false }));

    try {
      const data = await accountService.getAccountBalance(accountId);
      setBalances((prev) => ({
        ...prev,
        [accountId]: typeof data?.balance === 'number' ? data.balance : 0,
      }));
    } catch {
      setBalancesError((prev) => ({ ...prev, [accountId]: true }));
    } finally {
      setBalancesLoading((prev) => ({ ...prev, [accountId]: false }));
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await accountService.getAccounts();
      const accountList = Array.isArray(data?.accounts) ? data.accounts : [];
      setAccounts(accountList);

      // Fetch derived ledger balances for all retrieved accounts
      accountList.forEach((acc) => {
        if (acc?._id) {
          fetchBalanceForAccount(acc._id);
        }
      });
    } catch (err) {
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else if (err.request && !err.response) {
        setError('Unable to connect to the server. Please check your network connection.');
      } else {
        setError('Failed to load your accounts. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [fetchBalanceForAccount]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const handleOpenAccountClick = () => {
    navigate('/accounts/open');
  };

  const handleCopyId = (id) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const formatAccountType = (type) => {
    if (!type) return 'Savings Account';
    const upper = String(type).toUpperCase();
    if (upper === 'SAVINGS') return 'Savings Account';
    if (upper === 'CURRENT') return 'Current Account';
    return `${type} Account`;
  };

  const getStatusBadgeClass = (status) => {
    switch (status?.toUpperCase()) {
      case 'ACTIVE':
        return 'badge badge-success';
      case 'SUSPENDED':
        return 'badge badge-danger';
      case 'INACTIVE':
        return 'badge badge-warning';
      default:
        return 'badge badge-neutral';
    }
  };

  // Open Deposit Modal
  const openDepositModal = (account) => {
    setActiveModalAccount(account || (accounts.find(a => a.status === 'ACTIVE') || accounts[0]));
    setAmountInput('');
    setDescriptionInput('');
    setModalError('');
    setModalSuccess(null);
    setShowDepositModal(true);
  };

  // Open Withdraw Modal
  const openWithdrawModal = (account) => {
    setActiveModalAccount(account || (accounts.find(a => a.status === 'ACTIVE') || accounts[0]));
    setAmountInput('');
    setDescriptionInput('');
    setModalError('');
    setModalSuccess(null);
    setShowWithdrawModal(true);
  };

  // Handle Deposit Submission
  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    setModalError('');
    setModalSuccess(null);

    const numAmount = parseFloat(amountInput);
    if (!activeModalAccount?._id) {
      setModalError('Please select a valid destination account.');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setModalError('Please enter a valid positive cash deposit amount.');
      return;
    }

    setModalSubmitting(true);
    try {
      const idempotencyKey = `DEP_${activeModalAccount._id}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const res = await transactionService.depositCash({
        accountId: activeModalAccount._id,
        amount: numAmount,
        description: descriptionInput.trim() || 'Direct Branch Cash Deposit',
        idempotencyKey,
      });

      setModalSuccess({
        message: 'Cash deposit processed successfully!',
        transaction: res.transaction,
        newBalance: res.account?.balance,
      });

      // Refresh live derived balance for this account
      await fetchBalanceForAccount(activeModalAccount._id);
    } catch (err) {
      if (err.response?.data?.message) {
        setModalError(err.response.data.message);
      } else {
        setModalError('Cash deposit failed. Please try again.');
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  // Handle Withdrawal Submission
  const handleWithdrawSubmit = async (e) => {
    e.preventDefault();
    setModalError('');
    setModalSuccess(null);

    const numAmount = parseFloat(amountInput);
    if (!activeModalAccount?._id) {
      setModalError('Please select a valid source account.');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setModalError('Please enter a valid positive cash withdrawal amount.');
      return;
    }

    const availableBal = balances[activeModalAccount._id] ?? 0;
    if (numAmount > availableBal) {
      setModalError(`Insufficient funds. Your available balance is ${formatCurrency(availableBal, activeModalAccount.currency || 'INR')}.`);
      return;
    }

    setModalSubmitting(true);
    try {
      const idempotencyKey = `WTH_${activeModalAccount._id}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const res = await transactionService.withdrawCash({
        accountId: activeModalAccount._id,
        amount: numAmount,
        description: descriptionInput.trim() || 'ATM Cash Withdrawal',
        idempotencyKey,
      });

      setModalSuccess({
        message: 'Cash withdrawal processed successfully!',
        transaction: res.transaction,
        newBalance: res.account?.balance,
      });

      // Refresh live derived balance for this account
      await fetchBalanceForAccount(activeModalAccount._id);
    } catch (err) {
      if (err.response?.data?.message) {
        setModalError(err.response.data.message);
      } else {
        setModalError('Cash withdrawal failed. Please check transfer limits and try again.');
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  const activeAccounts = accounts.filter(a => a.status === 'ACTIVE');

  return (
    <div className="page-container">
      <div className="page-header page-header-row">
        <div>
          <h1>Your Accounts</h1>
          <p>Manage your deposit accounts and review derived ledger balances.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {activeAccounts.length > 0 && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => openDepositModal(activeAccounts[0])}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                💵 Deposit Cash
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => openWithdrawModal(activeAccounts[0])}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                🏧 ATM Withdraw
              </button>
            </>
          )}
          <Link to="/accounts/applications" className="btn btn-secondary">
            My Applications
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenAccountClick}
          >
            + Open New Account
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
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

      {loading ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <span className="spinner-inline" style={{ width: '28px', height: '28px' }} />
            <p style={{ marginTop: '1rem', color: '#64748b' }}>Loading your accounts...</p>
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💳</div>
          <h3>No Accounts Found</h3>
          <p>
            You do not have any active deposit accounts yet. Complete our account opening application
            to start transacting with double-entry ledger security.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenAccountClick}
          >
            Open Your First Account
          </button>
        </div>
      ) : (
        <div className="accounts-grid">
          {accounts.map((account) => {
            const isBalLoading = balancesLoading[account._id];
            const hasBalError = balancesError[account._id];
            const balanceVal = balances[account._id];
            const customerName = account.accountHolderName || account.user?.name || user?.name || 'Account Holder';
            const isActive = account.status === 'ACTIVE';

            return (
              <div key={account._id} className="account-card">
                <div className="account-card-header">
                  <div className="account-holder-info">
                    <span className="account-owner-name">{customerName}</span>
                    <span className="account-type">{formatAccountType(account.accountType)}</span>
                  </div>
                  <span className={getStatusBadgeClass(account.status)}>
                    {account.status || 'ACTIVE'}
                  </span>
                </div>

                {account.status === 'SUSPENDED' && (
                  <div
                    style={{
                      margin: '0.75rem 1rem 0',
                      padding: '0.5rem 0.75rem',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '4px',
                      color: '#991b1b',
                      fontSize: '0.75rem',
                    }}
                  >
                    ⚠️ <strong>Account Suspended:</strong> Inflows and outflows are temporarily restricted. Please contact customer support.
                  </div>
                )}

                {account.status === 'INACTIVE' && (
                  <div
                    style={{
                      margin: '0.75rem 1rem 0',
                      padding: '0.5rem 0.75rem',
                      backgroundColor: '#fffbeb',
                      border: '1px solid #fef3c7',
                      borderRadius: '4px',
                      color: '#92400e',
                      fontSize: '0.75rem',
                    }}
                  >
                    ℹ️ <strong>Account Inactive:</strong> This account has been deactivated. Transactions cannot be initiated.
                  </div>
                )}

                <div className="account-card-body">
                  <div className="account-id-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="label">Account Number / ID</span>
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          color: '#0284c7',
                          padding: 0,
                        }}
                        onClick={() => handleCopyId(account._id)}
                      >
                        {copiedId === account._id ? 'Copied!' : 'Copy ID'}
                      </button>
                    </div>
                    <span className="account-id-val">{account._id}</span>
                  </div>

                  <div className="account-balance-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="label">Available Ledger Balance</span>
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          color: '#64748b',
                          padding: 0,
                        }}
                        title="Refresh Balance"
                        onClick={() => fetchBalanceForAccount(account._id)}
                        disabled={isBalLoading}
                      >
                        {isBalLoading ? '...' : '↻ Refresh'}
                      </button>
                    </div>

                    {isBalLoading ? (
                      <div className="balance-loading">
                        <span className="spinner-inline" /> Fetching ledger balance...
                      </div>
                    ) : hasBalError ? (
                      <div className="balance-error">
                        <span>Balance unavailable</span>{' '}
                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#0284c7',
                            fontSize: '0.75rem',
                            textDecoration: 'underline',
                          }}
                          onClick={() => fetchBalanceForAccount(account._id)}
                        >
                          Retry
                        </button>
                      </div>
                    ) : (
                      <span className="balance-amount">
                        {formatCurrency(balanceVal, account.currency || 'INR')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="account-card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.375rem' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      onClick={() => openDepositModal(account)}
                      disabled={!isActive}
                      title={!isActive ? 'Account must be active for cash deposits' : 'Deposit cash to this account'}
                    >
                      💵 Deposit
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      onClick={() => openWithdrawModal(account)}
                      disabled={!isActive}
                      title={!isActive ? 'Account must be active for cash withdrawals' : 'Withdraw cash from this account'}
                    >
                      🏧 Withdraw
                    </button>
                  </div>
                  <Link
                    to={`/accounts/${account._id}/statement`}
                    className="btn btn-sm btn-primary"
                    style={{ textDecoration: 'none', padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
                  >
                    📄 Statement
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cash Deposit Modal */}
      {showDepositModal && (
        <div className="modal-backdrop" onClick={() => !modalSubmitting && setShowDepositModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>💵</span> Direct Cash Deposit
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !modalSubmitting && setShowDepositModal(false)}
                disabled={modalSubmitting}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              {modalError && (
                <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                  {modalError}
                </div>
              )}

              {modalSuccess ? (
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
                  <h4 style={{ color: '#059669', marginBottom: '0.5rem' }}>Deposit Completed</h4>
                  <p style={{ color: '#475569', fontSize: '0.875rem', marginBottom: '1rem' }}>
                    {modalSuccess.message}
                  </p>
                  <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '6px', textAlign: 'left', fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
                    <div><strong>Reference:</strong> <code>{modalSuccess.transaction?._id}</code></div>
                    <div><strong>Credited Amount:</strong> {formatCurrency(modalSuccess.transaction?.amount, activeModalAccount?.currency || 'INR')}</div>
                    <div><strong>Accounting:</strong> DEBIT Cash Vault → CREDIT Your Account</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={() => setShowDepositModal(false)}
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleDepositSubmit} noValidate>
                  <div className="form-group">
                    <label htmlFor="deposit-account-select">Destination Account</label>
                    <select
                      id="deposit-account-select"
                      value={activeModalAccount?._id || ''}
                      onChange={(e) => {
                        const acc = accounts.find(a => a._id === e.target.value);
                        if (acc) setActiveModalAccount(acc);
                      }}
                      disabled={modalSubmitting}
                    >
                      {activeAccounts.map((acc) => (
                        <option key={acc._id} value={acc._id}>
                          {acc.accountHolderName || 'Account'} ({acc._id.substring(0, 8)}...) — {formatCurrency(balances[acc._id] ?? 0, acc.currency || 'INR')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="deposit-amount">Deposit Amount (₹)</label>
                    <input
                      id="deposit-amount"
                      type="number"
                      placeholder="e.g. 5000"
                      step="0.01"
                      min="1"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      disabled={modalSubmitting}
                      required
                    />
                    <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.5rem' }}>
                      {[500, 1000, 5000, 10000].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className="btn btn-sm btn-secondary"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => setAmountInput(String(preset))}
                        >
                          +₹{preset.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="deposit-desc">Description / Memo (Optional)</label>
                    <input
                      id="deposit-desc"
                      type="text"
                      placeholder="e.g. Branch counter cash deposit"
                      value={descriptionInput}
                      onChange={(e) => setDescriptionInput(e.target.value)}
                      disabled={modalSubmitting}
                    />
                  </div>

                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '0.75rem', fontSize: '0.75rem', color: '#166534', marginBottom: '1.25rem' }}>
                    ℹ️ <strong>Ledger Security:</strong> Cash will be debited from the System Cash Vault and atomically credited to your account via double-entry journal entries.
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowDepositModal(false)}
                      disabled={modalSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={modalSubmitting}
                    >
                      {modalSubmitting ? 'Processing Deposit...' : 'Confirm Cash Deposit'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cash Withdrawal Modal */}
      {showWithdrawModal && (
        <div className="modal-backdrop" onClick={() => !modalSubmitting && setShowWithdrawModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🏧</span> ATM Cash Withdrawal
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => !modalSubmitting && setShowWithdrawModal(false)}
                disabled={modalSubmitting}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              {modalError && (
                <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                  {modalError}
                </div>
              )}

              {modalSuccess ? (
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>💵</div>
                  <h4 style={{ color: '#059669', marginBottom: '0.5rem' }}>Cash Dispensed</h4>
                  <p style={{ color: '#475569', fontSize: '0.875rem', marginBottom: '1rem' }}>
                    {modalSuccess.message}
                  </p>
                  <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '6px', textAlign: 'left', fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
                    <div><strong>Reference:</strong> <code>{modalSuccess.transaction?._id}</code></div>
                    <div><strong>Dispensed Amount:</strong> {formatCurrency(modalSuccess.transaction?.amount, activeModalAccount?.currency || 'INR')}</div>
                    <div><strong>Accounting:</strong> DEBIT Your Account → CREDIT Cash Vault</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={() => setShowWithdrawModal(false)}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleWithdrawSubmit} noValidate>
                  <div className="form-group">
                    <label htmlFor="withdraw-account-select">Source Account</label>
                    <select
                      id="withdraw-account-select"
                      value={activeModalAccount?._id || ''}
                      onChange={(e) => {
                        const acc = accounts.find(a => a._id === e.target.value);
                        if (acc) setActiveModalAccount(acc);
                      }}
                      disabled={modalSubmitting}
                    >
                      {activeAccounts.map((acc) => (
                        <option key={acc._id} value={acc._id}>
                          {acc.accountHolderName || 'Account'} ({acc._id.substring(0, 8)}...) — Available: {formatCurrency(balances[acc._id] ?? 0, acc.currency || 'INR')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label htmlFor="withdraw-amount" style={{ marginBottom: 0 }}>Withdrawal Amount (₹)</label>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Avail: <strong>{formatCurrency(balances[activeModalAccount?._id] ?? 0, activeModalAccount?.currency || 'INR')}</strong>
                      </span>
                    </div>
                    <input
                      id="withdraw-amount"
                      type="number"
                      placeholder="e.g. 2000"
                      step="0.01"
                      min="1"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      disabled={modalSubmitting}
                      required
                    />
                    <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.5rem' }}>
                      {[500, 1000, 2000, 5000].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className="btn btn-sm btn-secondary"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => setAmountInput(String(preset))}
                        >
                          ₹{preset.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="withdraw-desc">ATM Location / Memo (Optional)</label>
                    <input
                      id="withdraw-desc"
                      type="text"
                      placeholder="e.g. Downtown ATM Terminal #4"
                      value={descriptionInput}
                      onChange={(e) => setDescriptionInput(e.target.value)}
                      disabled={modalSubmitting}
                    />
                  </div>

                  <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '6px', padding: '0.75rem', fontSize: '0.75rem', color: '#92400e', marginBottom: '1.25rem' }}>
                    ⚠️ <strong>ATM Limit Policy:</strong> Standard per-transaction and daily limits apply. The account balance will be verified atomically.
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowWithdrawModal(false)}
                      disabled={modalSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={modalSubmitting}
                    >
                      {modalSubmitting ? 'Dispensing Cash...' : 'Confirm Withdrawal'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Accounts;

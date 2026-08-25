import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { accountService } from '../services/account.service';
import { formatCurrency, formatDate } from '../utils/formatters';

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

  return (
    <div className="page-container">
      <div className="page-header page-header-row">
        <div>
          <h1>Your Accounts</h1>
          <p>Manage your deposit accounts and review derived ledger balances.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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

                <div className="account-card-footer">
                  <span>Currency: <strong>{account.currency || 'INR'}</strong></span>
                  <span>Opened: {formatDate(account.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Accounts;

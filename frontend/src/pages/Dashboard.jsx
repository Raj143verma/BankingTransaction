import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { accountService } from '../services/account.service';
import { transactionService } from '../services/transaction.service';
import { formatCurrency, formatDate } from '../utils/formatters';

export function Dashboard() {
  const { user } = useAuth();

  const [accounts, setAccounts] = useState([]);
  const [balances, setBalances] = useState({});
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsError, setAccountsError] = useState('');

  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [transactionsError, setTransactionsError] = useState('');

  const [copiedId, setCopiedId] = useState(null);
  const [summary, setSummary] = useState({
    totalCredits: 0,
    totalDebits: 0,
    netMovement: 0,
    totalTransactions: 0,
  });

  // Fetch derived ledger balance for a specific account
  const fetchBalanceForAccount = useCallback(async (accountId) => {
    try {
      const data = await accountService.getAccountBalance(accountId);
      setBalances((prev) => ({
        ...prev,
        [accountId]: typeof data?.balance === 'number' ? data.balance : 0,
      }));
    } catch {
      setBalances((prev) => ({
        ...prev,
        [accountId]: 0,
      }));
    }
  }, []);

  // Fetch accounts and their ledger balances
  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setAccountsError('');

    try {
      const data = await accountService.getAccounts();
      const accountList = Array.isArray(data?.accounts) ? data.accounts : [];
      setAccounts(accountList);

      // Fetch derived ledger balances for all accounts concurrently
      await Promise.allSettled(
        accountList.map((acc) => {
          if (acc?._id) {
            return fetchBalanceForAccount(acc._id);
          }
          return Promise.resolve();
        })
      );
    } catch (err) {
      if (err.response?.data?.message) {
        setAccountsError(err.response.data.message);
      } else if (err.request && !err.response) {
        setAccountsError('Unable to connect to the server. Please check your network connection.');
      } else {
        setAccountsError('Failed to load accounts. Please try again.');
      }
    } finally {
      setLoadingAccounts(false);
    }
  }, [fetchBalanceForAccount]);

  // Fetch transaction summary and recent transactions
  const loadTransactions = useCallback(async () => {
    setLoadingTransactions(true);
    setTransactionsError('');

    try {
      const [summaryResult, txResult] = await Promise.allSettled([
        transactionService.getTransactionSummary(),
        transactionService.getTransactions({ limit: 5 }),
      ]);

      if (summaryResult.status === 'fulfilled' && summaryResult.value) {
        const s = summaryResult.value;
        setSummary({
          totalCredits: typeof s.totalCredits === 'number' ? s.totalCredits : 0,
          totalDebits: typeof s.totalDebits === 'number' ? s.totalDebits : 0,
          netMovement: typeof s.netMovement === 'number' ? s.netMovement : 0,
          totalTransactions: typeof s.totalTransactions === 'number' ? s.totalTransactions : 0,
        });
      }

      if (txResult.status === 'fulfilled' && txResult.value) {
        const txList = Array.isArray(txResult.value.transactions) ? txResult.value.transactions : [];
        setTransactions(txList);
      } else if (txResult.status === 'rejected') {
        const err = txResult.reason;
        if (err?.response?.data?.message) {
          setTransactionsError(err.response.data.message);
        } else if (err?.request && !err?.response) {
          setTransactionsError('Unable to load transaction history. Network connection failed.');
        } else {
          setTransactionsError('Failed to fetch transactions. Please try again.');
        }
      }
    } catch (err) {
      setTransactionsError(err?.message || 'Failed to fetch transaction data.');
    } finally {
      setLoadingTransactions(false);
    }
  }, []);

  // Load all dashboard data
  const loadDashboardData = useCallback(() => {
    loadAccounts();
    loadTransactions();
  }, [loadAccounts, loadTransactions]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

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

  // Derive sets and financial metrics dynamically from real ledger data
  const ownAccountIds = useMemo(() => new Set(accounts.map((a) => a._id)), [accounts]);
  const activeAccounts = useMemo(() => accounts.filter((a) => a.status === 'ACTIVE'), [accounts]);

  // 1. Total Balance: Sum of balances of active accounts
  const totalBalance = useMemo(() => {
    return activeAccounts.reduce((sum, acc) => {
      const b = balances[acc._id];
      return sum + (typeof b === 'number' ? b : 0);
    }, 0);
  }, [activeAccounts, balances]);

  // 2. Active Accounts count
  const activeAccountsCount = activeAccounts.length;

  // 3 & 4. Total Credits & Total Debits from authenticated user's transactions summary
  const totalCredits = summary.totalCredits;
  const totalDebits = summary.totalDebits;

  // Net Movement
  const netMovement = summary.netMovement;
  const totalMovementVolume = totalCredits + totalDebits;
  const creditPercent = totalMovementVolume > 0 ? (totalCredits / totalMovementVolume) * 100 : 50;

  // Recent 5 transactions
  const recentTransactions = useMemo(() => transactions.slice(0, 5), [transactions]);

  const isLoadingOverall = loadingAccounts || loadingTransactions;

  return (
    <div className="page-container">
      {/* 1. Dashboard Header */}
      <div className="page-header page-header-row">
        <div>
          <h1>Dashboard</h1>
          <p>
            Welcome back, <strong>{user?.name || 'Customer'}</strong>. Here&apos;s your banking overview.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadDashboardData}
            disabled={isLoadingOverall}
            title="Refresh all dashboard data"
          >
            {isLoadingOverall ? 'Refreshing...' : '↻ Refresh Data'}
          </button>
          <Link to="/transactions" className="btn btn-primary btn-sm">
            ↗ Transfer Funds
          </Link>
        </div>
      </div>

      {/* Global Errors Banner */}
      {accountsError && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>
          <span>{accountsError}</span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            style={{ marginLeft: '1rem' }}
            onClick={loadAccounts}
          >
            Retry Accounts
          </button>
        </div>
      )}

      {transactionsError && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: '1rem' }}>
          <span>{transactionsError}</span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            style={{ marginLeft: '1rem' }}
            onClick={loadTransactions}
          >
            Retry Transactions
          </button>
        </div>
      )}

      {/* 2. Financial Summary Cards (4 Cards) */}
      <div className="dashboard-summary-grid">
        {/* Card A: TOTAL BALANCE */}
        <div className="summary-metric-card">
          <div className="metric-header">
            <span className="metric-label">Total Balance</span>
            <span className="metric-icon-badge badge-balance">LEDGER</span>
          </div>
          <div className="metric-value-wrap">
            {loadingAccounts ? (
              <div className="skeleton-box" style={{ height: '32px', width: '140px' }} />
            ) : (
              <span className="metric-value">{formatCurrency(totalBalance, 'INR')}</span>
            )}
          </div>
          <span className="metric-subtext">Available across all active accounts</span>
        </div>

        {/* Card B: ACTIVE ACCOUNTS */}
        <div className="summary-metric-card">
          <div className="metric-header">
            <span className="metric-label">Active Accounts</span>
            <span className="metric-icon-badge badge-accounts">DEPOSIT</span>
          </div>
          <div className="metric-value-wrap">
            {loadingAccounts ? (
              <div className="skeleton-box" style={{ height: '32px', width: '60px' }} />
            ) : (
              <span className="metric-value">{activeAccountsCount}</span>
            )}
          </div>
          <span className="metric-subtext">
            {activeAccountsCount === 1 ? '1 active deposit account' : `${activeAccountsCount} operational deposit accounts`}
          </span>
        </div>

        {/* Card C: TOTAL CREDITS */}
        <div className="summary-metric-card">
          <div className="metric-header">
            <span className="metric-label">Total Credits</span>
            <span className="metric-icon-badge badge-credits">INFLOW</span>
          </div>
          <div className="metric-value-wrap">
            {loadingTransactions ? (
              <div className="skeleton-box" style={{ height: '32px', width: '130px' }} />
            ) : (
              <span className="metric-value value-credit">+ {formatCurrency(totalCredits, 'INR')}</span>
            )}
          </div>
          <span className="metric-subtext">Total received &amp; credited to date</span>
        </div>

        {/* Card D: TOTAL DEBITS */}
        <div className="summary-metric-card">
          <div className="metric-header">
            <span className="metric-label">Total Debits</span>
            <span className="metric-icon-badge badge-debits">OUTFLOW</span>
          </div>
          <div className="metric-value-wrap">
            {loadingTransactions ? (
              <div className="skeleton-box" style={{ height: '32px', width: '130px' }} />
            ) : (
              <span className="metric-value value-debit">{formatCurrency(totalDebits, 'INR')}</span>
            )}
          </div>
          <span className="metric-subtext">Total transferred &amp; debited to date</span>
        </div>
      </div>

      {/* Main Dashboard Grid: Two Responsive Columns */}
      <div className="dashboard-main-grid">
        {/* Left Column: Account Overview + Quick Actions */}
        <div className="dashboard-column">
          {/* 3. Account Overview Section */}
          <div className="card">
            <div
              className="card-header"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <h3>Account Overview</h3>
              <Link to="/accounts" style={{ fontSize: '0.8125rem', color: '#0284c7', fontWeight: 600 }}>
                View All Accounts →
              </Link>
            </div>

            <div className="card-body">
              {loadingAccounts ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="skeleton-box" style={{ height: '78px', width: '100%' }} />
                  <div className="skeleton-box" style={{ height: '78px', width: '100%' }} />
                </div>
              ) : activeAccounts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem 0', color: '#64748b' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💳</div>
                  <p style={{ fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                    No active accounts yet
                  </p>
                  <p style={{ fontSize: '0.8125rem', marginBottom: '1rem' }}>
                    Open an account to start transacting with double-entry ledger security.
                  </p>
                  <Link to="/accounts/open" className="btn btn-primary btn-sm">
                    + Open New Account
                  </Link>
                </div>
              ) : (
                <div className="compact-accounts-list">
                  {activeAccounts.slice(0, 3).map((acc) => {
                    const holderName =
                      acc.accountHolderName || acc.user?.name || user?.name || 'Account Holder';
                    const bal = balances[acc._id];

                    return (
                      <div key={acc._id} className="compact-account-card">
                        <div className="card-top-row">
                          <span className="account-holder-name">{holderName}</span>
                          <span className="account-type-badge">{formatAccountType(acc.accountType)}</span>
                          <span className={getStatusBadgeClass(acc.status)} style={{ marginLeft: 'auto' }}>
                            {acc.status || 'ACTIVE'}
                          </span>
                        </div>

                        <div className="card-id-row">
                          <span>
                            Account: <strong className="acc-mono-id">{acc._id}</strong>
                          </span>
                          <button
                            type="button"
                            className="copy-link-btn"
                            onClick={() => handleCopyId(acc._id)}
                          >
                            {copiedId === acc._id ? 'Copied!' : 'Copy ID'}
                          </button>
                        </div>

                        <div className="card-balance-row">
                          <span className="balance-label">Available Balance:</span>
                          <span className="balance-val">
                            {formatCurrency(bal, acc.currency || 'INR')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 5. Quick Actions Section */}
          <div className="card">
            <div className="card-header">
              <h3>Quick Actions</h3>
            </div>

            <div className="card-body">
              <div className="quick-actions-grid">
                <Link to="/transactions" className="quick-action-tile">
                  <div className="action-icon">↗</div>
                  <div className="action-info">
                    <span className="action-title">Transfer Funds</span>
                    <span className="action-desc">Send funds to another account</span>
                  </div>
                </Link>

                <Link to="/accounts" className="quick-action-tile">
                  <div className="action-icon">💳</div>
                  <div className="action-info">
                    <span className="action-title">View Accounts</span>
                    <span className="action-desc">Check ledger balances &amp; details</span>
                  </div>
                </Link>

                <Link to="/accounts/open" className="quick-action-tile">
                  <div className="action-icon">➕</div>
                  <div className="action-info">
                    <span className="action-title">Open New Account</span>
                    <span className="action-desc">Apply for a deposit account</span>
                  </div>
                </Link>

                <Link to="/accounts/applications" className="quick-action-tile">
                  <div className="action-icon">📋</div>
                  <div className="action-info">
                    <span className="action-title">My Applications</span>
                    <span className="action-desc">Track submitted applications</span>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Recent Transactions + Account Activity Insights */}
        <div className="dashboard-column">
          {/* 4. Recent Transactions Section */}
          <div className="card">
            <div
              className="card-header"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <h3>Recent Transactions</h3>
              <Link to="/transactions" style={{ fontSize: '0.8125rem', color: '#0284c7', fontWeight: 600 }}>
                View All →
              </Link>
            </div>

            <div className="card-body">
              {loadingTransactions ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="skeleton-box" style={{ height: '70px', width: '100%' }} />
                  <div className="skeleton-box" style={{ height: '70px', width: '100%' }} />
                </div>
              ) : recentTransactions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                  <p style={{ fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                    No transactions yet
                  </p>
                  <p style={{ fontSize: '0.8125rem' }}>
                    Transfers, credits, and initial allocations will appear here.
                  </p>
                </div>
              ) : (
                <div className="activity-list" style={{ maxHeight: '380px' }}>
                  {recentTransactions.map((item) => {
                    const isOwnSender = ownAccountIds.has(item.fromAccount);
                    const isOwnReceiver = ownAccountIds.has(item.toAccount);
                    const isIncoming = isOwnReceiver && !isOwnSender;

                    const partyLabel = isIncoming ? 'From:' : 'To:';
                    const partyName = isIncoming
                      ? item.fromAccountHolderName || 'Account Holder'
                      : item.toAccountHolderName || 'Account Holder';
                    const relatedAccountId = isIncoming ? item.fromAccount : item.toAccount;

                    return (
                      <div key={item._id} className="activity-item">
                        <div className="activity-item-top">
                          <span
                            className={`activity-amount ${
                              isIncoming ? 'credit' : 'debit'
                            }`}
                          >
                            {isIncoming
                              ? `+ ${formatCurrency(item.amount)}`
                              : `- ${formatCurrency(item.amount)}`}
                          </span>
                          <div className="status-group">
                            <span
                              className={`transfer-tag ${
                                isIncoming ? 'tag-credit' : 'tag-debit'
                              }`}
                            >
                              INTERNAL TRANSFER
                            </span>
                            <span className="badge badge-success">{item.status || 'COMPLETED'}</span>
                          </div>
                        </div>

                        <div className="activity-item-meta">
                          <div className="meta-party-row">
                            <span>
                              {partyLabel} <strong className="party-name-label">{partyName}</strong>
                            </span>
                          </div>
                          <div className="meta-account-row">
                            <span>
                              Account: <span className="account-ref">{relatedAccountId}</span>
                            </span>
                          </div>
                          <div className="meta-footer-row">
                            <span className="tx-id">ID: {item._id}</span>
                            <span>{formatDate(item.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 6. Account Activity / Insights */}
          {transactions.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3>Account Activity Breakdown</h3>
              </div>

              <div className="card-body">
                <div className="activity-insights-box">
                  <div className="insights-stats-row">
                    <div className="stat-block">
                      <span className="stat-label">Money In</span>
                      <span className="stat-amount stat-in">+ {formatCurrency(totalCredits)}</span>
                    </div>

                    <div className="stat-block">
                      <span className="stat-label">Money Out</span>
                      <span className="stat-amount stat-out">- {formatCurrency(totalDebits)}</span>
                    </div>

                    <div className="stat-block">
                      <span className="stat-label">Net Movement</span>
                      <span
                        className={`stat-amount ${
                          netMovement >= 0 ? 'stat-in' : 'stat-out'
                        }`}
                      >
                        {netMovement >= 0 ? `+ ${formatCurrency(netMovement)}` : `- ${formatCurrency(Math.abs(netMovement))}`}
                      </span>
                    </div>
                  </div>

                  <div className="movement-bar-wrap">
                    <div className="bar-labels">
                      <span style={{ color: '#15803d' }}>Inflow ({creditPercent.toFixed(0)}%)</span>
                      <span style={{ color: '#b91c1c' }}>Outflow ({(100 - creditPercent).toFixed(0)}%)</span>
                    </div>
                    <div className="progress-bar-track">
                      <div
                        className="progress-bar-fill-in"
                        style={{ width: `${Math.min(100, Math.max(0, creditPercent))}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

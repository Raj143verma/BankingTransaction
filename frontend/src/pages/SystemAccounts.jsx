import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { accountService } from '../services/account.service';
import { formatCurrency, formatDate } from '../utils/formatters';

export function SystemAccounts() {
  const { user } = useAuth();
  const isSystemUser = user?.systemUser === true;

  const [accounts, setAccounts] = useState([]);
  const [balances, setBalances] = useState({});
  const [balancesLoading, setBalancesLoading] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [selectedStatusTab, setSelectedStatusTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Status Action Modal State
  const [targetAccount, setTargetAccount] = useState(null);
  const [targetStatus, setTargetStatus] = useState('');
  const [reason, setReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [modalError, setModalError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Fetch derived ledger balance for an account
  const fetchBalanceForAccount = useCallback(async (accountId) => {
    setBalancesLoading((prev) => ({ ...prev, [accountId]: true }));
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
    } finally {
      setBalancesLoading((prev) => ({ ...prev, [accountId]: false }));
    }
  }, []);

  // Fetch all customer deposit accounts
  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await accountService.getCustomerAccounts('ALL');
      const list = Array.isArray(data?.accounts) ? data.accounts : [];
      setAccounts(list);

      // Concurrently query live balances
      list.forEach((acc) => {
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
        setError('Failed to load customer accounts. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [fetchBalanceForAccount]);

  useEffect(() => {
    if (isSystemUser) {
      loadAccounts();
    } else {
      setLoading(false);
    }
  }, [isSystemUser, loadAccounts]);

  // Counts for status tabs
  const counts = useMemo(() => {
    const total = accounts.length;
    const active = accounts.filter((a) => (a.status || 'ACTIVE') === 'ACTIVE').length;
    const suspended = accounts.filter((a) => a.status === 'SUSPENDED').length;
    const inactive = accounts.filter((a) => a.status === 'INACTIVE').length;
    return { total, active, suspended, inactive };
  }, [accounts]);

  // Filtered accounts based on status tab and search query
  const filteredAccounts = useMemo(() => {
    let result = accounts;

    if (selectedStatusTab !== 'ALL') {
      result = result.filter((a) => (a.status || 'ACTIVE') === selectedStatusTab);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((a) => {
        const idMatch = a._id?.toLowerCase().includes(q);
        const nameMatch = a.accountHolderName?.toLowerCase().includes(q);
        const emailMatch = a.user?.email?.toLowerCase().includes(q);
        return idMatch || nameMatch || emailMatch;
      });
    }

    return result;
  }, [accounts, selectedStatusTab, searchQuery]);

  const handleCopyId = (id) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'SUSPENDED':
        return <span className="badge badge-danger">SUSPENDED</span>;
      case 'INACTIVE':
        return <span className="badge badge-warning">INACTIVE</span>;
      case 'ACTIVE':
      default:
        return <span className="badge badge-success">ACTIVE</span>;
    }
  };

  // Open Status Change Modal
  const openStatusModal = (acc, newStatus) => {
    setTargetAccount(acc);
    setTargetStatus(newStatus);
    setReason('');
    setModalError('');
  };

  const closeModal = () => {
    if (isProcessing) return;
    setTargetAccount(null);
    setTargetStatus('');
    setReason('');
    setModalError('');
  };

  // Execute Status Transition
  const handleConfirmStatusChange = async (e) => {
    e.preventDefault();
    if (!targetAccount || !targetStatus || isProcessing) return;

    if (!reason.trim() || reason.trim().length < 5) {
      setModalError('Please provide a reason of at least 5 characters for this status change.');
      return;
    }

    setIsProcessing(true);
    setModalError('');
    setActionSuccess('');

    try {
      const response = await accountService.updateAccountStatus(
        targetAccount._id,
        targetStatus,
        reason.trim()
      );

      const updatedStatus = response?.account?.status || targetStatus;
      setActionSuccess(
        `Account for "${targetAccount.accountHolderName}" (${targetAccount._id}) has been updated to ${updatedStatus}.`
      );

      closeModal();
      await loadAccounts();
    } catch (err) {
      if (err.response?.data?.message) {
        setModalError(err.response.data.message);
      } else {
        setModalError('Failed to update account status. Please try again.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isSystemUser) {
    return (
      <div className="page-container">
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛡️</div>
            <h2>Access Restricted</h2>
            <p className="placeholder-text" style={{ maxWidth: '460px', margin: '0.75rem auto 1.5rem' }}>
              Account Lifecycle Management is restricted to authenticated SYSTEM administrators.
            </p>
            <Link to="/accounts" className="btn btn-primary">
              Back to Your Accounts
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentAccBalance = targetAccount ? balances[targetAccount._id] || 0 : 0;

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header page-header-row">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <h1>Account Lifecycle Management</h1>
            <span className="badge badge-system">ADMIN</span>
          </div>
          <p>Inspect customer deposit accounts, derived ledger balances, and manage operational lifecycle states.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadAccounts}
            disabled={loading}
          >
            {loading ? <span className="spinner-inline" /> : '↻ Refresh Accounts'}
          </button>
          <Link to="/system/applications" className="btn btn-secondary btn-sm">
            Applications Review
          </Link>
          <Link to="/system/funds" className="btn btn-secondary btn-sm">
            Fund Management
          </Link>
        </div>
      </div>

      {/* Success Alert */}
      {actionSuccess && (
        <div className="alert alert-success" role="alert">
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Error Alert */}
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

      {/* Controls Bar: Filter Tabs & Search */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div className="tab-group" style={{ display: 'flex', gap: '0.375rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${selectedStatusTab === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedStatusTab('ALL')}
          >
            All Accounts ({counts.total})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${selectedStatusTab === 'ACTIVE' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedStatusTab('ACTIVE')}
          >
            Active ({counts.active})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${selectedStatusTab === 'SUSPENDED' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedStatusTab('SUSPENDED')}
          >
            Suspended ({counts.suspended})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${selectedStatusTab === 'INACTIVE' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedStatusTab('INACTIVE')}
          >
            Inactive ({counts.inactive})
          </button>
        </div>

        <div style={{ flex: '1', maxWidth: '320px', minWidth: '220px' }}>
          <input
            type="text"
            placeholder="Search by ID, name, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '0.45rem 0.75rem', fontSize: '0.875rem' }}
          />
        </div>
      </div>

      {/* Accounts Content */}
      {loading ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3.5rem' }}>
            <span className="spinner-inline" style={{ width: '28px', height: '28px' }} />
            <p style={{ marginTop: '1rem', color: '#64748b' }}>Loading customer accounts and balances...</p>
          </div>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💳</div>
          <h3>No Customer Accounts Found</h3>
          <p>
            {searchQuery
              ? `No accounts matched your search "${searchQuery}".`
              : selectedStatusTab !== 'ALL'
              ? `There are currently no accounts with status "${selectedStatusTab}".`
              : 'No customer accounts have been created in the system yet.'}
          </p>
          {searchQuery && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setSearchQuery('')}
            >
              Clear Search
            </button>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Account Holder</th>
                    <th>Account ID</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Ledger Balance</th>
                    <th>Created</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((acc) => {
                    const currentStatus = acc.status || 'ACTIVE';
                    const bal = balances[acc._id];
                    const isBalLoading = balancesLoading[acc._id];

                    return (
                      <tr key={acc._id}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>
                            {acc.accountHolderName || acc.user?.name || 'Account Holder'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {acc.user?.email || '—'}
                          </div>
                        </td>

                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <span className="acc-mono-id">{acc._id}</span>
                            <button
                              type="button"
                              className="copy-link-btn"
                              onClick={() => handleCopyId(acc._id)}
                              title="Copy Account ID"
                            >
                              {copiedId === acc._id ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </td>

                        <td>
                          <span className="account-type-badge">
                            {acc.accountType || 'SAVINGS'}
                          </span>
                        </td>

                        <td>{getStatusBadge(currentStatus)}</td>

                        <td style={{ textAlign: 'right' }}>
                          {isBalLoading ? (
                            <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>...</span>
                          ) : (
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>
                              {formatCurrency(bal, acc.currency || 'INR')}
                            </span>
                          )}
                        </td>

                        <td style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                          {formatDate(acc.createdAt)}
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.375rem' }}>
                            {currentStatus === 'ACTIVE' && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-secondary"
                                  style={{ color: '#b91c1c', borderColor: '#fca5a5' }}
                                  onClick={() => openStatusModal(acc, 'SUSPENDED')}
                                >
                                  Suspend
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => openStatusModal(acc, 'INACTIVE')}
                                >
                                  Deactivate
                                </button>
                              </>
                            )}

                            {currentStatus === 'SUSPENDED' && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  style={{ backgroundColor: '#15803d', borderColor: '#15803d' }}
                                  onClick={() => openStatusModal(acc, 'ACTIVE')}
                                >
                                  Reactivate
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => openStatusModal(acc, 'INACTIVE')}
                                >
                                  Deactivate
                                </button>
                              </>
                            )}

                            {currentStatus === 'INACTIVE' && (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                style={{ backgroundColor: '#15803d', borderColor: '#15803d' }}
                                onClick={() => openStatusModal(acc, 'ACTIVE')}
                              >
                                Reactivate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Status Change Confirmation Modal */}
      {targetAccount && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-content"
            style={{ maxWidth: '520px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>
                {targetStatus === 'SUSPENDED'
                  ? 'Suspend Customer Account'
                  : targetStatus === 'ACTIVE'
                  ? 'Reactivate Customer Account'
                  : 'Deactivate Customer Account'}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeModal}
                disabled={isProcessing}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmStatusChange}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {modalError && (
                  <div className="alert alert-error" role="alert">
                    {modalError}
                  </div>
                )}

                {/* Account Summary Box */}
                <div
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '0.875rem',
                    fontSize: '0.875rem',
                  }}
                >
                  <div style={{ marginBottom: '0.375rem' }}>
                    <strong>Account Holder:</strong> {targetAccount.accountHolderName || 'Account Holder'}
                  </div>
                  <div style={{ marginBottom: '0.375rem' }}>
                    <strong>Account ID:</strong> <span className="acc-mono-id">{targetAccount._id}</span>
                  </div>
                  <div style={{ marginBottom: '0.375rem' }}>
                    <strong>Current Balance:</strong>{' '}
                    <span style={{ fontWeight: 700 }}>
                      {formatCurrency(currentAccBalance, targetAccount.currency || 'INR')}
                    </span>
                  </div>
                  <div>
                    <strong>Status Transition:</strong>{' '}
                    <span className="badge badge-neutral">{targetAccount.status || 'ACTIVE'}</span>
                    {' → '}
                    {getStatusBadge(targetStatus)}
                  </div>
                </div>

                {/* Balance Warning for Inactivation */}
                {targetStatus === 'INACTIVE' && currentAccBalance > 0 && (
                  <div
                    className="alert"
                    style={{
                      backgroundColor: '#fffbeb',
                      borderColor: '#fde68a',
                      color: '#92400e',
                      fontSize: '0.8125rem',
                    }}
                  >
                    ⚠️ <strong>Balance Warning:</strong> This account currently has an available balance of{' '}
                    <strong>{formatCurrency(currentAccBalance, targetAccount.currency || 'INR')}</strong>.
                    Deactivating this account will lock any outgoing and incoming fund movements.
                  </div>
                )}

                {/* Reason Textarea */}
                <div className="form-group">
                  <label htmlFor="statusReason" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    Reason for Status Change <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <textarea
                    id="statusReason"
                    rows="3"
                    className="form-control"
                    placeholder="Enter compliance, fraud, or administrative justification..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={isProcessing}
                    required
                    style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Minimum 5 characters required for audit logging.
                  </span>
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={closeModal}
                  disabled={isProcessing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn btn-sm ${
                    targetStatus === 'SUSPENDED'
                      ? 'btn-danger'
                      : targetStatus === 'ACTIVE'
                      ? 'btn-primary'
                      : 'btn-secondary'
                  }`}
                  disabled={isProcessing || !reason.trim() || reason.trim().length < 5}
                >
                  {isProcessing ? 'Updating...' : `Confirm ${targetStatus}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SystemAccounts;

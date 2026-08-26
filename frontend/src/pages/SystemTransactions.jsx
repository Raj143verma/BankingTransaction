import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { transactionService } from '../services/transaction.service';
import { formatCurrency, formatDate } from '../utils/formatters';

export function SystemTransactions() {
  const { user } = useAuth();
  const isSystemUser = user?.systemUser === true;

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Filter States
  const [filterInputs, setFilterInputs] = useState({
    search: '',
    fromDate: '',
    toDate: '',
    status: 'ALL',
  });
  const [appliedFilters, setAppliedFilters] = useState({
    search: '',
    fromDate: '',
    toDate: '',
    status: 'ALL',
  });
  const [showFilters, setShowFilters] = useState(false);

  // Pagination State
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalCount: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // Reversal Modal State
  const [targetTx, setTargetTx] = useState(null);
  const [reversalReason, setReversalReason] = useState('');
  const [isReversing, setIsReversing] = useState(false);
  const [modalError, setModalError] = useState('');

  const loadTransactions = useCallback(async (pageToLoad = 1, currentFilters = appliedFilters) => {
    setLoading(true);
    setError('');

    try {
      const params = {
        page: pageToLoad,
        limit: 10,
      };

      if (currentFilters.search && currentFilters.search.trim()) {
        params.search = currentFilters.search.trim();
      }
      if (currentFilters.fromDate) {
        params.fromDate = currentFilters.fromDate;
      }
      if (currentFilters.toDate) {
        params.toDate = currentFilters.toDate;
      }
      if (currentFilters.status && currentFilters.status !== 'ALL') {
        params.status = currentFilters.status;
      }

      const data = await transactionService.getSystemTransactions(params);
      const list = Array.isArray(data?.transactions) ? data.transactions : [];
      setTransactions(list);

      if (data?.pagination) {
        setPagination({
          page: data.pagination.page || pageToLoad,
          limit: data.pagination.limit || 10,
          totalCount: typeof data.pagination.totalCount === 'number' ? data.pagination.totalCount : list.length,
          totalPages: data.pagination.totalPages || 1,
          hasNextPage: Boolean(data.pagination.hasNextPage),
          hasPrevPage: Boolean(data.pagination.hasPrevPage),
        });
      }
    } catch (err) {
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else if (err.request && !err.response) {
        setError('Unable to connect to the server. Please check your network connection.');
      } else {
        setError('Failed to load transaction records. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    if (isSystemUser) {
      loadTransactions(1, appliedFilters);
    } else {
      setLoading(false);
    }
  }, [isSystemUser, appliedFilters, loadTransactions]);

  const handleApplyFilters = (e) => {
    if (e) e.preventDefault();
    setAppliedFilters({ ...filterInputs });
    loadTransactions(1, filterInputs);
  };

  const handleResetFilters = () => {
    const defaultFilters = {
      search: '',
      fromDate: '',
      toDate: '',
      status: 'ALL',
    };
    setFilterInputs(defaultFilters);
    setAppliedFilters(defaultFilters);
    loadTransactions(1, defaultFilters);
  };

  const handleStatusTabClick = (statusVal) => {
    const updated = { ...filterInputs, status: statusVal };
    setFilterInputs(updated);
    setAppliedFilters(updated);
    loadTransactions(1, updated);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages && newPage !== pagination.page) {
      loadTransactions(newPage, appliedFilters);
    }
  };

  const handleCopyId = (id) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const openReversalModal = (tx) => {
    setTargetTx(tx);
    setReversalReason('');
    setModalError('');
  };

  const closeReversalModal = () => {
    if (isReversing) return;
    setTargetTx(null);
    setReversalReason('');
    setModalError('');
  };

  const handleConfirmReversal = async (e) => {
    e.preventDefault();
    if (!targetTx || isReversing) return;

    if (!reversalReason.trim() || reversalReason.trim().length < 5) {
      setModalError('Please provide a valid reversal reason of at least 5 characters.');
      return;
    }

    setIsReversing(true);
    setModalError('');
    setActionSuccess('');

    try {
      await transactionService.reverseTransaction(targetTx._id, reversalReason.trim());
      setActionSuccess(
        `Transaction ${targetTx._id} (₹${targetTx.amount}) has been successfully reversed. Compensating ledger entries have been written.`
      );
      closeReversalModal();
      await loadTransactions(pagination.page, appliedFilters);
    } catch (err) {
      if (err.response?.data?.message) {
        setModalError(err.response.data.message);
      } else {
        setModalError('Failed to reverse transaction. Please try again.');
      }
    } finally {
      setIsReversing(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'COMPLETED':
        return <span className="badge badge-success">COMPLETED</span>;
      case 'REVERSED':
        return <span className="badge badge-danger">REVERSED</span>;
      case 'PENDING':
        return <span className="badge badge-warning">PENDING</span>;
      case 'FAILED':
        return <span className="badge badge-neutral">FAILED</span>;
      default:
        return <span className="badge badge-neutral">{status}</span>;
    }
  };

  const isFilterApplied = Boolean(
    appliedFilters.search ||
    appliedFilters.fromDate ||
    appliedFilters.toDate ||
    appliedFilters.status !== 'ALL'
  );

  if (!isSystemUser) {
    return (
      <div className="page-container">
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛡️</div>
            <h2>Access Restricted</h2>
            <p className="placeholder-text" style={{ maxWidth: '460px', margin: '0.75rem auto 1.5rem' }}>
              System Transaction Management is restricted to authenticated SYSTEM administrators.
            </p>
            <Link to="/transactions" className="btn btn-primary">
              Back to Your Transactions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header page-header-row">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <h1>System Transactions & Reversals</h1>
            <span className="badge badge-system">ADMIN</span>
          </div>
          <p>Inspect bank-wide transaction flows, audit settled transfers, and execute atomic compensating reversals.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => loadTransactions(pagination.page, appliedFilters)}
            disabled={loading}
          >
            {loading ? <span className="spinner-inline" /> : '↻ Refresh'}
          </button>
          <Link to="/system/accounts" className="btn btn-secondary btn-sm">
            Accounts Admin
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
            onClick={() => loadTransactions(pagination.page, appliedFilters)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Controls Bar: Status Tabs & Filter Toggle */}
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
        <div className="tab-group" style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          {['ALL', 'COMPLETED', 'REVERSED', 'PENDING', 'FAILED'].map((st) => (
            <button
              key={st}
              type="button"
              className={`btn btn-sm ${appliedFilters.status === st ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleStatusTabClick(st)}
            >
              {st === 'ALL' ? 'All Transactions' : st.charAt(0) + st.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`btn btn-sm ${showFilters || isFilterApplied ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowFilters((prev) => !prev)}
        >
          🔍 Filters {isFilterApplied && '•'}
        </button>
      </div>

      {/* Collapsible Search & Filter Panel */}
      {showFilters && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div className="card-body">
            <form onSubmit={handleApplyFilters}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="sysSearch" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                    Search ID, Account, or Name
                  </label>
                  <input
                    id="sysSearch"
                    type="text"
                    placeholder="e.g. TX123, Account ID, Raj..."
                    value={filterInputs.search}
                    onChange={(e) => setFilterInputs((prev) => ({ ...prev, search: e.target.value }))}
                    style={{ width: '100%', padding: '0.45rem 0.75rem', fontSize: '0.875rem' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="sysFromDate" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                    From Date
                  </label>
                  <input
                    id="sysFromDate"
                    type="date"
                    value={filterInputs.fromDate}
                    onChange={(e) => setFilterInputs((prev) => ({ ...prev, fromDate: e.target.value }))}
                    style={{ width: '100%', padding: '0.45rem 0.75rem', fontSize: '0.875rem' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="sysToDate" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                    To Date
                  </label>
                  <input
                    id="sysToDate"
                    type="date"
                    value={filterInputs.toDate}
                    onChange={(e) => setFilterInputs((prev) => ({ ...prev, toDate: e.target.value }))}
                    style={{ width: '100%', padding: '0.45rem 0.75rem', fontSize: '0.875rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                {isFilterApplied && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleResetFilters}
                  >
                    Reset
                  </button>
                )}
                <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                  Apply Filters
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transactions Content */}
      {loading ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3.5rem' }}>
            <span className="spinner-inline" style={{ width: '28px', height: '28px' }} />
            <p style={{ marginTop: '1rem', color: '#64748b' }}>Loading bank transaction records...</p>
          </div>
        </div>
      ) : transactions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3>No Transactions Found</h3>
          <p>
            {isFilterApplied
              ? 'No transactions matched your current search and filter criteria.'
              : 'There are no transaction records in the banking system yet.'}
          </p>
          {isFilterApplied && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleResetFilters}
            >
              Clear Filters
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
                    <th>Transaction ID</th>
                    <th>From Account (Debit)</th>
                    <th>To Account (Credit)</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const isReversed = tx.status === 'REVERSED';
                    const isCompleted = tx.status === 'COMPLETED';

                    return (
                      <tr key={tx._id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <span className="acc-mono-id">{tx._id}</span>
                            <button
                              type="button"
                              className="copy-link-btn"
                              onClick={() => handleCopyId(tx._id)}
                              title="Copy ID"
                            >
                              {copiedId === tx._id ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                          {isReversed && tx.reversalReason && (
                            <div style={{ fontSize: '0.6875rem', color: '#b91c1c', marginTop: '0.25rem', maxWidth: '180px' }}>
                              <strong>Reversed:</strong> {tx.reversalReason}
                            </div>
                          )}
                        </td>

                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>
                            {tx.fromAccountHolderName || 'Account Holder'}
                          </div>
                          <span className="acc-mono-id" style={{ fontSize: '0.6875rem' }}>
                            {tx.fromAccount}
                          </span>
                        </td>

                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>
                            {tx.toAccountHolderName || 'Account Holder'}
                          </div>
                          <span className="acc-mono-id" style={{ fontSize: '0.6875rem' }}>
                            {tx.toAccount}
                          </span>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <span
                            style={{
                              fontWeight: 700,
                              color: isReversed ? '#94a3b8' : '#0f172a',
                              textDecoration: isReversed ? 'line-through' : 'none',
                            }}
                          >
                            {formatCurrency(tx.amount)}
                          </span>
                        </td>

                        <td>{getStatusBadge(tx.status)}</td>

                        <td style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                          {formatDate(tx.createdAt)}
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          {isCompleted ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              style={{ color: '#b91c1c', borderColor: '#fca5a5' }}
                              onClick={() => openReversalModal(tx)}
                            >
                              Reverse
                            </button>
                          ) : isReversed ? (
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              Reversed
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.875rem 1.25rem',
                  borderTop: '1px solid #e2e8f0',
                  fontSize: '0.875rem',
                }}
              >
                <div style={{ color: '#64748b' }}>
                  Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount} transactions
                </div>

                <div style={{ display: 'flex', gap: '0.375rem' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    disabled={!pagination.hasPrevPage || loading}
                    onClick={() => handlePageChange(pagination.page - 1)}
                  >
                    ‹ Prev
                  </button>
                  <span style={{ padding: '0.25rem 0.5rem', alignSelf: 'center', fontWeight: 600 }}>
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    disabled={!pagination.hasNextPage || loading}
                    onClick={() => handlePageChange(pagination.page + 1)}
                  >
                    Next ›
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reversal Confirmation Modal */}
      {targetTx && (
        <div className="modal-overlay" onClick={closeReversalModal}>
          <div
            className="modal-content"
            style={{ maxWidth: '520px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Reverse Transaction</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeReversalModal}
                disabled={isReversing}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmReversal}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {modalError && (
                  <div className="alert alert-error" role="alert">
                    {modalError}
                  </div>
                )}

                {/* Reversal Summary Box */}
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
                    <strong>Transaction ID:</strong> <span className="acc-mono-id">{targetTx._id}</span>
                  </div>
                  <div style={{ marginBottom: '0.375rem' }}>
                    <strong>Reversal Amount:</strong>{' '}
                    <span style={{ fontWeight: 700, color: '#b91c1c' }}>{formatCurrency(targetTx.amount)}</span>
                  </div>
                  <div style={{ marginBottom: '0.375rem' }}>
                    <strong>Original Sender (Will be Credited):</strong>{' '}
                    {targetTx.fromAccountHolderName} (<span className="acc-mono-id">{targetTx.fromAccount}</span>)
                  </div>
                  <div>
                    <strong>Original Receiver (Will be Debited):</strong>{' '}
                    {targetTx.toAccountHolderName} (<span className="acc-mono-id">{targetTx.toAccount}</span>)
                  </div>
                </div>

                {/* Permanent Reversal Warning Alert */}
                <div
                  className="alert"
                  style={{
                    backgroundColor: '#fef2f2',
                    borderColor: '#fecaca',
                    color: '#991b1b',
                    fontSize: '0.8125rem',
                  }}
                >
                  ⚠️ <strong>Permanent Action:</strong> This operation creates compensating double-entry ledger entries, debiting <strong>{formatCurrency(targetTx.amount)}</strong> from the destination account and crediting it back to the source account. <em>This cannot be undone.</em>
                </div>

                {/* Reversal Reason Textarea */}
                <div className="form-group">
                  <label htmlFor="reversalReasonInput" style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    Reason for Reversal <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <textarea
                    id="reversalReasonInput"
                    rows="3"
                    className="form-control"
                    placeholder="Enter compliance, fraud, duplicate, or reconciliation reason..."
                    value={reversalReason}
                    onChange={(e) => setReversalReason(e.target.value)}
                    disabled={isReversing}
                    required
                    style={{ width: '100%', padding: '0.5rem', fontSize: '0.875rem' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Minimum 5 characters required for administrative audit log.
                  </span>
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={closeReversalModal}
                  disabled={isReversing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger btn-sm"
                  disabled={isReversing || !reversalReason.trim() || reversalReason.trim().length < 5}
                >
                  {isReversing ? 'Reversing...' : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SystemTransactions;

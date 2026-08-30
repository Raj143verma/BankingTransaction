import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { auditLogService } from '../services/auditLog.service';
import { formatDate } from '../utils/formatters';

const ACTION_OPTIONS = [
  { value: 'ALL', label: 'All Actions' },
  { value: 'SYSTEM_LOGIN', label: 'System Login' },
  { value: 'SYSTEM_LOGOUT', label: 'System Logout' },
  { value: 'APPLICATION_APPROVED', label: 'Application Approved' },
  { value: 'APPLICATION_REJECTED', label: 'Application Rejected' },
  { value: 'ACCOUNT_SUSPENDED', label: 'Account Suspended' },
  { value: 'ACCOUNT_REACTIVATED', label: 'Account Reactivated' },
  { value: 'ACCOUNT_DEACTIVATED', label: 'Account Deactivated' },
  { value: 'TRANSACTION_REVERSED', label: 'Transaction Reversed' },
  { value: 'SYSTEM_FUNDS_INITIALIZED', label: 'System Funds Initialized' },
];

const RESOURCE_OPTIONS = [
  { value: 'ALL', label: 'All Resources' },
  { value: 'ACCOUNT', label: 'Account' },
  { value: 'ACCOUNT_APPLICATION', label: 'Application' },
  { value: 'TRANSACTION', label: 'Transaction' },
  { value: 'USER', label: 'User / Auth' },
  { value: 'SYSTEM', label: 'System' },
];

export function SystemAuditLogs() {
  const { user } = useAuth();
  const isSystemUser = user?.systemUser === true;

  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  // Filter States
  const [filterInputs, setFilterInputs] = useState({
    action: 'ALL',
    resourceType: 'ALL',
    search: '',
    fromDate: '',
    toDate: '',
  });
  const [appliedFilters, setAppliedFilters] = useState({
    action: 'ALL',
    resourceType: 'ALL',
    search: '',
    fromDate: '',
    toDate: '',
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

  // Details Modal State
  const [selectedLog, setSelectedLog] = useState(null);

  const loadAuditLogs = useCallback(
    async (pageToLoad = 1, currentFilters = appliedFilters) => {
      setLoading(true);
      setError('');

      try {
        const params = {
          page: pageToLoad,
          limit: 10,
        };

        if (currentFilters.action && currentFilters.action !== 'ALL') {
          params.action = currentFilters.action;
        }
        if (currentFilters.resourceType && currentFilters.resourceType !== 'ALL') {
          params.resourceType = currentFilters.resourceType;
        }
        if (currentFilters.search && currentFilters.search.trim()) {
          params.search = currentFilters.search.trim();
        }
        if (currentFilters.fromDate) {
          params.fromDate = currentFilters.fromDate;
        }
        if (currentFilters.toDate) {
          params.toDate = currentFilters.toDate;
        }

        const data = await auditLogService.getAuditLogs(params);
        const list = Array.isArray(data?.auditLogs) ? data.auditLogs : [];
        setAuditLogs(list);

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
          setError('Failed to load audit records. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    },
    [appliedFilters]
  );

  useEffect(() => {
    if (isSystemUser) {
      loadAuditLogs(1, appliedFilters);
    } else {
      setLoading(false);
    }
  }, [isSystemUser, appliedFilters, loadAuditLogs]);

  const handleApplyFilters = (e) => {
    if (e) e.preventDefault();
    setAppliedFilters({ ...filterInputs });
    loadAuditLogs(1, filterInputs);
  };

  const handleResetFilters = () => {
    const defaultFilters = {
      action: 'ALL',
      resourceType: 'ALL',
      search: '',
      fromDate: '',
      toDate: '',
    };
    setFilterInputs(defaultFilters);
    setAppliedFilters(defaultFilters);
    loadAuditLogs(1, defaultFilters);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages && newPage !== pagination.page) {
      loadAuditLogs(newPage, appliedFilters);
    }
  };

  const handleCopyId = (id) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const openDetailsModal = (log) => {
    setSelectedLog(log);
  };

  const closeDetailsModal = () => {
    setSelectedLog(null);
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'APPLICATION_APPROVED':
        return <span className="badge badge-success">APP APPROVED</span>;
      case 'APPLICATION_REJECTED':
        return <span className="badge badge-danger">APP REJECTED</span>;
      case 'ACCOUNT_SUSPENDED':
        return <span className="badge badge-danger">ACCOUNT SUSPENDED</span>;
      case 'ACCOUNT_REACTIVATED':
        return <span className="badge badge-success">ACCOUNT REACTIVATED</span>;
      case 'ACCOUNT_DEACTIVATED':
        return <span className="badge badge-neutral">ACCOUNT DEACTIVATED</span>;
      case 'TRANSACTION_REVERSED':
        return <span className="badge badge-danger">TX REVERSED</span>;
      case 'SYSTEM_FUNDS_INITIALIZED':
        return <span className="badge badge-primary">FUNDS INITIALIZED</span>;
      case 'SYSTEM_LOGIN':
        return <span className="badge badge-system">LOGIN</span>;
      case 'SYSTEM_LOGOUT':
        return <span className="badge badge-neutral">LOGOUT</span>;
      default:
        return <span className="badge badge-neutral">{action}</span>;
    }
  };

  const isFilterApplied = Boolean(
    appliedFilters.action !== 'ALL' ||
      appliedFilters.resourceType !== 'ALL' ||
      appliedFilters.search ||
      appliedFilters.fromDate ||
      appliedFilters.toDate
  );

  if (!isSystemUser) {
    return (
      <div className="page-container">
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛡️</div>
            <h2>Access Restricted</h2>
            <p className="placeholder-text" style={{ maxWidth: '460px', margin: '0.75rem auto 1.5rem' }}>
              System Audit Trail & Operations Log is restricted to authenticated SYSTEM administrators.
            </p>
            <Link to="/dashboard" className="btn btn-primary">
              Back to Dashboard
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
            <h1>System Audit Trail & Operations Log</h1>
            <span className="badge badge-system">AUDIT</span>
          </div>
          <p>Immutable append-only record of administrative interventions, lifecycle state transitions, and security events.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => loadAuditLogs(pagination.page, appliedFilters)}
            disabled={loading}
          >
            {loading ? <span className="spinner-inline" /> : '↻ Refresh'}
          </button>
          <Link to="/system/accounts" className="btn btn-secondary btn-sm">
            Accounts Admin
          </Link>
          <Link to="/system/transactions" className="btn btn-secondary btn-sm">
            Transactions Admin
          </Link>
          <Link to="/system/applications" className="btn btn-secondary btn-sm">
            Applications
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            style={{ marginLeft: '1rem' }}
            onClick={() => loadAuditLogs(pagination.page, appliedFilters)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Controls Bar: Action Filter Quick Tabs & Search Filter Toggle */}
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
          {[
            { key: 'ALL', label: 'All Events' },
            { key: 'ACCOUNT_SUSPENDED', label: 'Suspensions' },
            { key: 'TRANSACTION_REVERSED', label: 'Reversals' },
            { key: 'APPLICATION_APPROVED', label: 'Approvals' },
            { key: 'SYSTEM_LOGIN', label: 'Logins' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`btn btn-sm ${appliedFilters.action === tab.key ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                const updated = { ...filterInputs, action: tab.key };
                setFilterInputs(updated);
                setAppliedFilters(updated);
                loadAuditLogs(1, updated);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`btn btn-sm ${showFilters || isFilterApplied ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowFilters((prev) => !prev)}
        >
          🔍 Advanced Filters {isFilterApplied && '•'}
        </button>
      </div>

      {/* Collapsible Search & Filter Panel */}
      {showFilters && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div className="card-body">
            <form onSubmit={handleApplyFilters}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1rem',
                }}
              >
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="auditAction" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                    Action
                  </label>
                  <select
                    id="auditAction"
                    value={filterInputs.action}
                    onChange={(e) => setFilterInputs((prev) => ({ ...prev, action: e.target.value }))}
                    style={{ width: '100%', padding: '0.45rem 0.75rem', fontSize: '0.875rem' }}
                  >
                    {ACTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="auditResource" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                    Resource Type
                  </label>
                  <select
                    id="auditResource"
                    value={filterInputs.resourceType}
                    onChange={(e) => setFilterInputs((prev) => ({ ...prev, resourceType: e.target.value }))}
                    style={{ width: '100%', padding: '0.45rem 0.75rem', fontSize: '0.875rem' }}
                  >
                    {RESOURCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="auditSearch" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                    Search Keyword / ID
                  </label>
                  <input
                    id="auditSearch"
                    type="text"
                    placeholder="Search reason, actor, ID..."
                    value={filterInputs.search}
                    onChange={(e) => setFilterInputs((prev) => ({ ...prev, search: e.target.value }))}
                    style={{ width: '100%', padding: '0.45rem 0.75rem', fontSize: '0.875rem' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="auditFromDate" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                    From Date
                  </label>
                  <input
                    id="auditFromDate"
                    type="date"
                    value={filterInputs.fromDate}
                    onChange={(e) => setFilterInputs((prev) => ({ ...prev, fromDate: e.target.value }))}
                    style={{ width: '100%', padding: '0.45rem 0.75rem', fontSize: '0.875rem' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="auditToDate" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                    To Date
                  </label>
                  <input
                    id="auditToDate"
                    type="date"
                    value={filterInputs.toDate}
                    onChange={(e) => setFilterInputs((prev) => ({ ...prev, toDate: e.target.value }))}
                    style={{ width: '100%', padding: '0.45rem 0.75rem', fontSize: '0.875rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                {isFilterApplied && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleResetFilters}>
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

      {/* Audit Logs Content */}
      {loading ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3.5rem' }}>
            <span className="spinner-inline" style={{ width: '28px', height: '28px' }} />
            <p style={{ marginTop: '1rem', color: '#64748b' }}>Loading audit trail logs...</p>
          </div>
        </div>
      ) : auditLogs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🛡️</div>
          <h3>No Audit Records Found</h3>
          <p>
            {isFilterApplied
              ? 'No audit logs matched your current search and filter criteria.'
              : 'There are no recorded system audit events in the database yet.'}
          </p>
          {isFilterApplied && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleResetFilters}>
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
                    <th>Timestamp</th>
                    <th>System Actor</th>
                    <th>Action</th>
                    <th>Resource</th>
                    <th>Target ID</th>
                    <th>Reason / Details</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log._id}>
                      <td style={{ fontSize: '0.8125rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {formatDate(log.createdAt)}
                      </td>

                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {log.actor?.name || 'System User'}
                        </div>
                        <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                          {log.actor?.email || ''}
                        </div>
                      </td>

                      <td>{getActionBadge(log.action)}</td>

                      <td>
                        <span className="transfer-tag" style={{ fontSize: '0.6875rem' }}>
                          {log.resourceType}
                        </span>
                      </td>

                      <td>
                        {log.resourceId ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <span className="acc-mono-id">{log.resourceId}</span>
                            <button
                              type="button"
                              className="copy-link-btn"
                              onClick={() => handleCopyId(log.resourceId)}
                              title="Copy Target ID"
                            >
                              {copiedId === log.resourceId ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>

                      <td style={{ maxWidth: '240px' }}>
                        {log.reason ? (
                          <span style={{ fontSize: '0.8125rem', color: '#0f172a' }}>
                            {log.reason.length > 50 ? `${log.reason.slice(0, 50)}...` : log.reason}
                          </span>
                        ) : log.metadata?.amount ? (
                          <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                            Amount: ₹{log.metadata.amount}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>Standard Operation</span>
                        )}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() => openDetailsModal(log)}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
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
                  Showing {(pagination.page - 1) * pagination.limit + 1}–
                  {Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount} audit events
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

      {/* Audit Record Details Modal */}
      {selectedLog && (
        <div className="modal-overlay" onClick={closeDetailsModal}>
          <div
            className="modal-content"
            style={{ maxWidth: '640px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Audit Event Details</h3>
              <button type="button" className="modal-close-btn" onClick={closeDetailsModal}>
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Event Overview Box */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '0.875rem',
                  fontSize: '0.875rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div>
                    <strong>Action:</strong> {getActionBadge(selectedLog.action)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {formatDate(selectedLog.createdAt)}
                  </div>
                </div>

                <div style={{ marginBottom: '0.375rem' }}>
                  <strong>Actor:</strong> {selectedLog.actor?.name || 'System User'} ({selectedLog.actor?.email}) [
                  <span className="acc-mono-id">{selectedLog.actor?._id || selectedLog.actor}</span>]
                </div>

                <div style={{ marginBottom: '0.375rem' }}>
                  <strong>Resource:</strong> {selectedLog.resourceType}{' '}
                  {selectedLog.resourceId && (
                    <>
                      (ID: <span className="acc-mono-id">{selectedLog.resourceId}</span>)
                    </>
                  )}
                </div>

                {selectedLog.reason && (
                  <div>
                    <strong>Reason / Justification:</strong>{' '}
                    <span style={{ color: '#0f172a', fontWeight: 600 }}>{selectedLog.reason}</span>
                  </div>
                )}
              </div>

              {/* State Transition Snapshot */}
              {(selectedLog.previousState || selectedLog.newState) && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: selectedLog.previousState ? '1fr 1fr' : '1fr',
                    gap: '0.75rem',
                  }}
                >
                  {selectedLog.previousState && (
                    <div>
                      <strong style={{ fontSize: '0.8125rem', color: '#64748b' }}>Previous State:</strong>
                      <pre
                        style={{
                          marginTop: '0.25rem',
                          padding: '0.5rem',
                          backgroundColor: '#f1f5f9',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          overflowX: 'auto',
                        }}
                      >
                        {JSON.stringify(selectedLog.previousState, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedLog.newState && (
                    <div>
                      <strong style={{ fontSize: '0.8125rem', color: '#64748b' }}>New State:</strong>
                      <pre
                        style={{
                          marginTop: '0.25rem',
                          padding: '0.5rem',
                          backgroundColor: '#ecfdf5',
                          border: '1px solid #d1fae5',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          overflowX: 'auto',
                        }}
                      >
                        {JSON.stringify(selectedLog.newState, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Metadata & Network Context */}
              <div
                style={{
                  fontSize: '0.75rem',
                  color: '#64748b',
                  borderTop: '1px solid #e2e8f0',
                  paddingTop: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}
              >
                <div>
                  <strong>Audit Log ID:</strong> <span className="acc-mono-id">{selectedLog._id}</span>
                </div>
                {selectedLog.ipAddress && (
                  <div>
                    <strong>Origin IP:</strong> {selectedLog.ipAddress}
                  </div>
                )}
                {selectedLog.userAgent && (
                  <div>
                    <strong>User Agent:</strong> {selectedLog.userAgent}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={closeDetailsModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SystemAuditLogs;

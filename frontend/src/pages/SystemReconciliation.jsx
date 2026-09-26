import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { reconciliationService } from '../services/reconciliation.service';
import { formatDate, formatCurrency } from '../utils/formatters';

const SEVERITY_OPTIONS = [
  { value: 'ALL', label: 'All Severities' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'INFO', label: 'Info' },
];

export function SystemReconciliation() {
  const { user } = useAuth();
  const isSystemUser = user?.systemUser === true;

  // Main state
  const [latestRun, setLatestRun] = useState(null);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [activeTab, setActiveTab] = useState('anomalies'); // 'anomalies', 'accounts', 'history'

  // Anomaly filter state
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [searchFilter, setSearchFilter] = useState('');

  // Modals
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedRunDetails, setSelectedRunDetails] = useState(null);
  const [downloadingFormat, setDownloadingFormat] = useState(null); // 'pdf' | 'csv' | null

  // Load latest run and history
  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const runsData = await reconciliationService.getRuns({ page: 1, limit: 10 });
      const runsList = runsData?.runs || [];
      setRuns(runsList);

      if (runsData?.pagination) {
        setHistoryPagination({
          page: runsData.pagination.page || 1,
          limit: runsData.pagination.limit || 10,
          totalCount: runsData.pagination.totalCount || 0,
          totalPages: runsData.pagination.totalPages || 1,
        });
      }

      // If we have runs, load the most recent one in full
      if (runsList.length > 0) {
        const fullLatest = await reconciliationService.getRunById(runsList[0]._id);
        setLatestRun(fullLatest?.data || null);
      } else {
        setLatestRun(null);
      }
    } catch (err) {
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('Failed to load reconciliation records. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSystemUser) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [isSystemUser, loadData]);

  // Execute new reconciliation run
  const handleExecuteRun = async () => {
    setShowConfirmModal(false);
    setRunning(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await reconciliationService.runReconciliation();
      setSuccessMessage('Financial reconciliation completed successfully.');
      if (response?.data) {
        setLatestRun(response.data);
      }
      await loadData();
    } catch (err) {
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('Failed to complete reconciliation run. Please try again.');
      }
    } finally {
      setRunning(false);
    }
  };

  // View historical run details
  const handleViewDetails = async (runId) => {
    setSelectedRunDetails(null);
    try {
      const res = await reconciliationService.getRunById(runId);
      setSelectedRunDetails(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load run details');
    }
  };

  // Downloads
  const handleDownloadCsv = async (runId) => {
    if (!runId) return;
    setDownloadingFormat('csv');
    try {
      await reconciliationService.downloadCsv(runId);
    } catch {
      setError('Failed to download CSV export');
    } finally {
      setDownloadingFormat(null);
    }
  };

  const handleDownloadPdf = async (runId) => {
    if (!runId) return;
    setDownloadingFormat('pdf');
    try {
      await reconciliationService.downloadPdf(runId);
    } catch {
      setError('Failed to download PDF export');
    } finally {
      setDownloadingFormat(null);
    }
  };

  if (!isSystemUser) {
    return (
      <div className="system-container" style={{ padding: '2rem 0' }}>
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <div className="card-body">
            <h2 style={{ color: '#dc2626' }}>Access Restricted</h2>
            <p style={{ color: '#64748b', margin: '1rem 0' }}>
              Financial Reconciliation and Ledger Integrity tooling is restricted to authorized System Administrators.
            </p>
            <Link to="/dashboard" className="btn btn-primary">
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Filter anomalies for latest run
  const allAnomalies = latestRun?.anomalies || [];
  const filteredAnomalies = allAnomalies.filter((anom) => {
    const matchesSeverity = severityFilter === 'ALL' || anom.severity === severityFilter;
    const matchesSearch =
      !searchFilter ||
      anom.description?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      anom.anomalyType?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      anom.resourceId?.toLowerCase().includes(searchFilter.toLowerCase());
    return matchesSeverity && matchesSearch;
  });

  return (
    <div className="system-reconciliation-page" style={{ padding: '1.5rem 0 3rem' }}>
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: '#0f172a' }}>
            Financial Ledger Reconciliation
          </h1>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            Authoritative double-entry balance verification, anomaly detection, and operational integrity audits.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {latestRun && (
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleDownloadCsv(latestRun.runId)}
                disabled={downloadingFormat !== null}
              >
                {downloadingFormat === 'csv' ? 'Exporting...' : 'Export CSV'}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleDownloadPdf(latestRun.runId)}
                disabled={downloadingFormat !== null}
              >
                {downloadingFormat === 'pdf' ? 'Exporting...' : 'Export PDF'}
              </button>
            </>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowConfirmModal(true)}
            disabled={running || loading}
          >
            {running ? 'Reconciling Ledger...' : 'Run Reconciliation'}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      {successMessage && (
        <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
          {successMessage}
        </div>
      )}

      {/* Executive KPI Summary Cards */}
      {latestRun ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem',
          }}
        >
          {/* Status Card */}
          <div
            className="card"
            style={{
              borderLeft: `4px solid ${latestRun.status === 'BALANCED' ? '#16a34a' : '#dc2626'}`,
            }}
          >
            <div className="card-body" style={{ padding: '1.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Ledger Status
              </span>
              <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span
                  style={{
                    fontSize: '1.35rem',
                    fontWeight: 700,
                    color: latestRun.status === 'BALANCED' ? '#16a34a' : '#dc2626',
                  }}
                >
                  {latestRun.status === 'BALANCED' ? 'BALANCED' : 'MISMATCH DETECTED'}
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Diff: INR {(latestRun.difference || 0).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Global Credits vs Debits */}
          <div className="card">
            <div className="card-body" style={{ padding: '1.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Total Ledger Credits
              </span>
              <div style={{ marginTop: '0.5rem', fontSize: '1.35rem', fontWeight: 700, color: '#16a34a' }}>
                {formatCurrency(latestRun.totalCredits || 0)}
              </div>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Debits: {formatCurrency(latestRun.totalDebits || 0)}
              </span>
            </div>
          </div>

          {/* Entity Counts */}
          <div className="card">
            <div className="card-body" style={{ padding: '1.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Audited Entities
              </span>
              <div style={{ marginTop: '0.5rem', fontSize: '1.35rem', fontWeight: 700, color: '#0f172a' }}>
                {latestRun.totalAccountsChecked} Accounts
              </div>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {latestRun.totalTransactionsChecked} Txs | {latestRun.totalLedgerEntriesChecked} Ledger Rows
              </span>
            </div>
          </div>

          {/* Anomalies Card */}
          <div className="card">
            <div className="card-body" style={{ padding: '1.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Total Anomalies
              </span>
              <div
                style={{
                  marginTop: '0.5rem',
                  fontSize: '1.35rem',
                  fontWeight: 700,
                  color: latestRun.criticalAnomalies > 0 ? '#dc2626' : latestRun.totalAnomalies > 0 ? '#d97706' : '#16a34a',
                }}
              >
                {latestRun.totalAnomalies}
              </div>
              <span style={{ fontSize: '0.75rem', color: latestRun.criticalAnomalies > 0 ? '#dc2626' : '#64748b' }}>
                {latestRun.criticalAnomalies} Critical | {latestRun.warningAnomalies || 0} Warning
              </span>
            </div>
          </div>

          {/* Last Run Info */}
          <div className="card">
            <div className="card-body" style={{ padding: '1.25rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Last Audit Run
              </span>
              <div style={{ marginTop: '0.5rem', fontSize: '0.9375rem', fontWeight: 600, color: '#0f172a' }}>
                {formatDate(latestRun.completedAt)}
              </div>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Run ID: {latestRun.runId} ({latestRun.durationMs || 0}ms)
              </span>
            </div>
          </div>
        </div>
      ) : (
        !loading && (
          <div className="card" style={{ marginBottom: '2rem', textAlign: 'center', padding: '2rem' }}>
            <p style={{ color: '#64748b', marginBottom: '1rem' }}>
              No historical reconciliation runs found. Click below to execute the first system audit.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowConfirmModal(true)}
              disabled={running}
            >
              Run Initial Reconciliation
            </button>
          </div>
        )
      )}

      {/* Tabs Navigation */}
      {latestRun && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', gap: '1rem' }}>
            <button
              type="button"
              onClick={() => setActiveTab('anomalies')}
              style={{
                background: 'none',
                border: 'none',
                padding: '0.75rem 1rem',
                fontWeight: 600,
                fontSize: '0.9375rem',
                cursor: 'pointer',
                borderBottom: activeTab === 'anomalies' ? '2px solid #0284c7' : '2px solid transparent',
                color: activeTab === 'anomalies' ? '#0284c7' : '#64748b',
              }}
            >
              Detected Anomalies ({allAnomalies.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('accounts')}
              style={{
                background: 'none',
                border: 'none',
                padding: '0.75rem 1rem',
                fontWeight: 600,
                fontSize: '0.9375rem',
                cursor: 'pointer',
                borderBottom: activeTab === 'accounts' ? '2px solid #0284c7' : '2px solid transparent',
                color: activeTab === 'accounts' ? '#0284c7' : '#64748b',
              }}
            >
              Account Balance Reconciliation ({latestRun.accountSummaries?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              style={{
                background: 'none',
                border: 'none',
                padding: '0.75rem 1rem',
                fontWeight: 600,
                fontSize: '0.9375rem',
                cursor: 'pointer',
                borderBottom: activeTab === 'history' ? '2px solid #0284c7' : '2px solid transparent',
                color: activeTab === 'history' ? '#0284c7' : '#64748b',
              }}
            >
              Audit Run History ({runs.length})
            </button>
          </div>
        </div>
      )}

      {/* Tab 1: Anomalies */}
      {latestRun && activeTab === 'anomalies' && (
        <div className="card">
          <div
            className="card-header"
            style={{
              padding: '1rem 1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="form-control"
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                style={{ width: 'auto', padding: '0.375rem 0.75rem' }}
              >
                {SEVERITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Search anomalies..."
                className="form-control"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                style={{ width: '220px', padding: '0.375rem 0.75rem' }}
              />
            </div>

            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
              Showing {filteredAnomalies.length} of {allAnomalies.length} anomalies
            </span>
          </div>

          <div className="table-responsive">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                    SEVERITY
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                    ANOMALY TYPE
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                    RESOURCE
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                    DESCRIPTION
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                    TIMESTAMP
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAnomalies.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: '#16a34a' }}>
                      ✓ No anomalies match the selected filters. All relevant ledger entities verified.
                    </td>
                  </tr>
                ) : (
                  filteredAnomalies.map((anom, idx) => {
                    const badgeClass =
                      anom.severity === 'CRITICAL'
                        ? 'badge-danger'
                        : anom.severity === 'WARNING'
                        ? 'badge-warning'
                        : 'badge-info';

                    return (
                      <tr key={anom._id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span className={`badge ${badgeClass}`}>{anom.severity}</span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600, fontSize: '0.8125rem' }}>
                          {anom.anomalyType}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', color: '#334155' }}>
                          <span style={{ fontWeight: 600 }}>{anom.resourceType}</span>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {anom.resourceId || 'N/A'}
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', color: '#1e293b' }}>
                          {anom.description}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', color: '#64748b' }}>
                          {formatDate(anom.timestamp)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Accounts Breakdown */}
      {latestRun && activeTab === 'accounts' && (
        <div className="card">
          <div className="card-header" style={{ padding: '1rem 1.25rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
              Per-Account Independent Ledger Balance Verification
            </h3>
          </div>
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                    ACCOUNT ID / HOLDER
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                    TYPE / STATUS
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#475569',
                      textAlign: 'right',
                    }}
                  >
                    TOTAL CREDITS
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#475569',
                      textAlign: 'right',
                    }}
                  >
                    TOTAL DEBITS
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#475569',
                      textAlign: 'right',
                    }}
                  >
                    CALCULATED BALANCE
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                    RECONCILIATION STATUS
                  </th>
                </tr>
              </thead>
              <tbody>
                {(latestRun.accountSummaries || []).map((acc) => (
                  <tr key={acc.accountId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{acc.accountHolderName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{acc.accountId}</div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem' }}>
                      <span>{acc.accountType}</span>
                      <span
                        className={`badge ${
                          acc.status === 'ACTIVE'
                            ? 'badge-success'
                            : acc.status === 'SUSPENDED'
                            ? 'badge-warning'
                            : 'badge-danger'
                        }`}
                        style={{ marginLeft: '0.5rem', fontSize: '0.6875rem' }}
                      >
                        {acc.status}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'right',
                        color: '#16a34a',
                        fontWeight: 600,
                        fontSize: '0.8125rem',
                      }}
                    >
                      +{acc.currency} {(acc.totalCredits || 0).toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'right',
                        color: '#dc2626',
                        fontWeight: 600,
                        fontSize: '0.8125rem',
                      }}
                    >
                      -{acc.currency} {(acc.totalDebits || 0).toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: '0.75rem 1rem',
                        textAlign: 'right',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        color: acc.calculatedBalance < 0 ? '#dc2626' : '#0284c7',
                      }}
                    >
                      {acc.currency} {(acc.calculatedBalance || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {acc.isBalanced ? (
                        <span className="badge badge-success">✓ RECONCILED</span>
                      ) : (
                        <span className="badge badge-danger">✗ MISMATCH</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: History */}
      {(!latestRun || activeTab === 'history') && (
        <div className="card">
          <div className="card-header" style={{ padding: '1rem 1.25rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
              Historical Reconciliation Audit Runs
            </h3>
          </div>
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                    RUN ID
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                    COMPLETED AT
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                    STATUS
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                    ENTITIES CHECKED
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                    ANOMALIES
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                    ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                      No previous reconciliation runs recorded.
                    </td>
                  </tr>
                ) : (
                  runs.map((r) => (
                    <tr key={r._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                        {r.runId}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', color: '#64748b' }}>
                        {formatDate(r.completedAt)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          className={`badge ${
                            r.status === 'BALANCED' ? 'badge-success' : 'badge-danger'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem', color: '#334155' }}>
                        {r.totalAccountsChecked} Accs | {r.totalTransactionsChecked} Txs | {r.totalLedgerEntriesChecked} Ledger
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem' }}>
                        <span style={{ color: r.criticalAnomalies > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                          {r.totalAnomalies} ({r.criticalAnomalies} Critical)
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleViewDetails(r._id)}
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleDownloadCsv(r.runId)}
                          >
                            CSV
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleDownloadPdf(r.runId)}
                          >
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div className="card" style={{ maxWidth: '500px', width: '100%', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
            <div className="card-header" style={{ padding: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
                Execute System Financial Reconciliation
              </h3>
            </div>
            <div className="card-body" style={{ padding: '1.25rem' }}>
              <p style={{ color: '#475569', fontSize: '0.875rem', lineHeight: 1.5 }}>
                This operational audit will independently verify double-entry ledger balance conservation ($\sum \text{Credits} = \sum \text{Debits}$), reconcile all customer and system reserve balances, verify transaction and reversal integrity, and record an immutable audit log entry.
              </p>
              <p style={{ color: '#0284c7', fontSize: '0.8125rem', fontWeight: 600 }}>
                Note: This operation is strictly READ-ONLY and will not alter any account balances or ledger entries.
              </p>
            </div>
            <div
              className="card-footer"
              style={{
                padding: '1rem 1.25rem',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                borderTop: '1px solid #e2e8f0',
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExecuteRun}
              >
                Confirm & Run Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Run Details Modal */}
      {selectedRunDetails && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div
              className="card-header"
              style={{
                padding: '1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
                  Reconciliation Run: {selectedRunDetails.runId}
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Completed {formatDate(selectedRunDetails.completedAt)}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedRunDetails(null)}
              >
                Close
              </button>
            </div>
            <div className="card-body" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>STATUS</div>
                  <div style={{ fontWeight: 700, color: selectedRunDetails.status === 'BALANCED' ? '#16a34a' : '#dc2626' }}>
                    {selectedRunDetails.status}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>TOTAL CREDITS</div>
                  <div style={{ fontWeight: 700, color: '#16a34a' }}>
                    INR {(selectedRunDetails.totalCredits || 0).toFixed(2)}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>TOTAL DEBITS</div>
                  <div style={{ fontWeight: 700, color: '#dc2626' }}>
                    INR {(selectedRunDetails.totalDebits || 0).toFixed(2)}
                  </div>
                </div>
              </div>

              <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                Recorded Anomalies ({selectedRunDetails.anomalies?.length || 0})
              </h4>
              {selectedRunDetails.anomalies?.length === 0 ? (
                <p style={{ color: '#16a34a', fontSize: '0.875rem' }}>✓ Zero anomalies recorded.</p>
              ) : (
                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  {selectedRunDetails.anomalies?.map((a, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '0.75rem',
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span className={`badge ${a.severity === 'CRITICAL' ? 'badge-danger' : 'badge-warning'}`}>
                          {a.severity}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{a.anomalyType}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8125rem', color: '#334155' }}>{a.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div
              className="card-footer"
              style={{
                padding: '1rem 1.25rem',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                borderTop: '1px solid #e2e8f0',
              }}
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleDownloadCsv(selectedRunDetails.runId)}
              >
                Export CSV
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleDownloadPdf(selectedRunDetails.runId)}
              >
                Export PDF
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setSelectedRunDetails(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SystemReconciliation;

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { statementService } from '../services/statement.service';
import { formatCurrency, formatDate } from '../utils/formatters';

export function AccountStatement() {
  const { id: accountId } = useParams();
  const { user } = useAuth();


  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(false);

  // Filters State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activePreset, setActivePreset] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  // Export Loading State
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  // Fetch Statement Data
  const loadStatement = useCallback(
    async (page = 1, start = startDate, end = endDate) => {
      if (!accountId) return;
      setLoading(true);
      setError('');

      try {
        const params = {
          page,
          limit: 15,
        };
        if (start) params.startDate = start;
        if (end) params.endDate = end;

        const data = await statementService.getStatement(accountId, params);
        setStatement(data);
        setCurrentPage(page);
      } catch (err) {
        if (err.response?.data?.message) {
          setError(err.response.data.message);
        } else if (err.request && !err.response) {
          setError('Unable to connect to server. Please check your connection.');
        } else {
          setError('Failed to load account statement.');
        }
      } finally {
        setLoading(false);
      }
    },
    [accountId, startDate, endDate]
  );

  useEffect(() => {
    loadStatement(1, startDate, endDate);
  }, [loadStatement, startDate, endDate]);

  // Preset Date Handlers
  const handlePreset = (preset) => {
    setActivePreset(preset);
    const now = new Date();
    let start = '';
    let end = '';

    if (preset === '7D') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      start = d.toISOString().substring(0, 10);
      end = now.toISOString().substring(0, 10);
    } else if (preset === '30D') {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      start = d.toISOString().substring(0, 10);
      end = now.toISOString().substring(0, 10);
    } else if (preset === 'THIS_MONTH') {
      const firstDay = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
      start = firstDay.toISOString().substring(0, 10);
      end = now.toISOString().substring(0, 10);
    } else if (preset === 'ALL') {
      start = '';
      end = '';
    }

    setStartDate(start);
    setEndDate(end);
    loadStatement(1, start, end);
  };

  const handleCustomFilter = (e) => {
    e.preventDefault();
    setActivePreset('CUSTOM');
    loadStatement(1, startDate, endDate);
  };

  const handleResetFilter = () => {
    setActivePreset('ALL');
    setStartDate('');
    setEndDate('');
    loadStatement(1, '', '');
  };

  // Export Handlers
  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      await statementService.downloadPdf(accountId, params);
    } catch {
      setError('Failed to download PDF statement. Please try again.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadCsv = async () => {
    setDownloadingCsv(true);
    try {
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      await statementService.downloadCsv(accountId, params);
    } catch {
      setError('Failed to download CSV statement. Please try again.');
    } finally {
      setDownloadingCsv(false);
    }
  };

  const copyAccountId = () => {
    if (accountId) {
      navigator.clipboard.writeText(accountId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const isSystemUser = user?.systemUser === true;
  const backLink = isSystemUser ? '/system/accounts' : '/accounts';

  return (
    <div className="account-statement-page" style={{ paddingBottom: '3rem' }}>
      {/* Navigation Breadcrumb */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Link to={backLink} className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
          ← Back to Accounts
        </Link>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            style={{ marginLeft: '1rem' }}
            onClick={() => loadStatement(currentPage, startDate, endDate)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Statement Header Card */}
      {statement?.account && (
        <div
          className="card"
          style={{
            marginBottom: '1.5rem',
            padding: '1.5rem',
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            color: '#ffffff',
            borderRadius: '0.75rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
                Account Statement
              </span>
              <h2 style={{ margin: '0.25rem 0', fontSize: '1.5rem', fontWeight: 700, color: '#f8fafc' }}>
                {statement.account.accountHolderName}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    background: 'rgba(255, 255, 255, 0.1)',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                  }}
                  onClick={copyAccountId}
                  title="Click to copy account ID"
                >
                  ID: {statement.account._id} {copiedId ? '✓ Copied' : '📋'}
                </span>
                <span className="badge badge-primary">{statement.account.accountType}</span>
                <span className={`badge ${statement.account.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
                  {statement.account.status}
                </span>
                <span style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>
                  Currency: <strong>{statement.account.currency}</strong>
                </span>
              </div>
            </div>

            {/* Export Actions Toolbar */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf || loading}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {downloadingPdf ? 'Generating PDF...' : '📥 Download PDF'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleDownloadCsv}
                disabled={downloadingCsv || loading}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {downloadingCsv ? 'Exporting CSV...' : '📊 Download CSV'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Date Range Selector Toolbar */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem', borderRadius: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          {/* Preset Buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569', marginRight: '0.25rem' }}>
              Period:
            </span>
            <button
              type="button"
              className={`btn btn-sm ${activePreset === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handlePreset('ALL')}
            >
              All Time
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activePreset === '7D' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handlePreset('7D')}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activePreset === '30D' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handlePreset('30D')}
            >
              Last 30 Days
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activePreset === 'THIS_MONTH' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handlePreset('THIS_MONTH')}
            >
              This Month
            </button>
          </div>

          {/* Custom Date Range Picker */}
          <form onSubmit={handleCustomFilter} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="date"
              className="form-control"
              style={{ width: 'auto', padding: '0.35rem 0.6rem', fontSize: '0.875rem' }}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="Start Date"
            />
            <span style={{ color: '#94a3b8' }}>to</span>
            <input
              type="date"
              className="form-control"
              style={{ width: 'auto', padding: '0.35rem 0.6rem', fontSize: '0.875rem' }}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="End Date"
            />
            <button type="submit" className="btn btn-sm btn-primary">
              Filter
            </button>
            {(startDate || endDate) && (
              <button type="button" className="btn btn-sm btn-secondary" onClick={handleResetFilter}>
                Clear
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Financial Summary Metric Cards */}
      {statement?.summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <div className="card" style={{ padding: '1.25rem', borderRadius: '0.75rem', borderLeft: '4px solid #64748b' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
              Opening Balance
            </span>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginTop: '0.25rem' }}>
              {formatCurrency(statement.summary.openingBalance)}
            </div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Balance at start of period</span>
          </div>

          <div className="card" style={{ padding: '1.25rem', borderRadius: '0.75rem', borderLeft: '4px solid #16a34a' }}>
            <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600, textTransform: 'uppercase' }}>
              Total Credits (+)
            </span>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#16a34a', marginTop: '0.25rem' }}>
              +{formatCurrency(statement.summary.totalCredits)}
            </div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Total money received</span>
          </div>

          <div className="card" style={{ padding: '1.25rem', borderRadius: '0.75rem', borderLeft: '4px solid #dc2626' }}>
            <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600, textTransform: 'uppercase' }}>
              Total Debits (-)
            </span>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#dc2626', marginTop: '0.25rem' }}>
              -{formatCurrency(statement.summary.totalDebits)}
            </div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Total money sent</span>
          </div>

          <div className="card" style={{ padding: '1.25rem', borderRadius: '0.75rem', borderLeft: '4px solid #0284c7' }}>
            <span style={{ fontSize: '0.75rem', color: '#0284c7', fontWeight: 600, textTransform: 'uppercase' }}>
              Closing Balance
            </span>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0284c7', marginTop: '0.25rem' }}>
              {formatCurrency(statement.summary.closingBalance)}
            </div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Authoritative ledger balance</span>
          </div>
        </div>
      )}

      {/* Statement Transactions Table */}
      <div className="card" style={{ padding: '0', borderRadius: '0.75rem', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
            Statement Line Items
          </h3>
          {statement?.summary && (
            <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
              Showing {statement.transactions?.length || 0} of {statement.summary.transactionCount} transactions
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            Loading verified account statement...
          </div>
        ) : statement?.transactions?.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>No transactions recorded during this statement period.</p>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#94a3b8' }}>
              Try selecting "All Time" or widening your date filter range.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover" style={{ margin: 0, width: '100%' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Date & Time</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Type / Ref</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Description</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Debit (-)</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Credit (+)</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Running Balance</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#475569', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {statement?.transactions?.map((tx, idx) => (
                  <tr key={tx.entryId || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', whiteSpace: 'nowrap', color: '#334155' }}>
                      {formatDate(tx.date)}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{tx.type}</div>
                      <div style={{ fontSize: '0.6875rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                        {tx.transactionId ? tx.transactionId.substring(0, 8) + '...' : ''}
                      </div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.8125rem', color: '#334155' }}>
                      <div>{tx.description}</div>
                      {tx.counterparty?.name && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Counterparty: <strong>{tx.counterparty.name}</strong>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', textAlign: 'right', fontWeight: 600 }}>
                      {tx.debit > 0 ? (
                        <span style={{ color: '#dc2626' }}>-{formatCurrency(tx.debit)}</span>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', textAlign: 'right', fontWeight: 600 }}>
                      {tx.credit > 0 ? (
                        <span style={{ color: '#16a34a' }}>+{formatCurrency(tx.credit)}</span>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontSize: '0.875rem', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>
                      {formatCurrency(tx.runningBalance)}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                      <span
                        className={`badge ${
                          tx.status === 'COMPLETED'
                            ? 'badge-success'
                            : tx.status === 'REVERSED'
                            ? 'badge-warning'
                            : 'badge-secondary'
                        }`}
                        style={{ fontSize: '0.6875rem' }}
                      >
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Toolbar */}
        {statement?.pagination && statement.pagination.totalPages > 1 && (
          <div
            style={{
              padding: '1rem',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
              Page {statement.pagination.page} of {statement.pagination.totalPages}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={!statement.pagination.hasPrevPage}
                onClick={() => loadStatement(statement.pagination.page - 1, startDate, endDate)}
              >
                ← Previous
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={!statement.pagination.hasNextPage}
                onClick={() => loadStatement(statement.pagination.page + 1, startDate, endDate)}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AccountStatement;

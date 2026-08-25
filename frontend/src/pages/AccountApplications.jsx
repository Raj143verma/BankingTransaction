import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { accountApplicationService } from '../services/accountApplication.service';
import { formatCurrency, formatDate } from '../utils/formatters';

export function AccountApplications() {
  const { user } = useAuth();
  const isSystemUser = user?.systemUser === true;

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await accountApplicationService.getMyApplications();
      const list = Array.isArray(data?.applications) ? data.applications : [];
      setApplications(list);
    } catch (err) {
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else if (err.request && !err.response) {
        setError('Unable to connect to the server. Please check your network connection.');
      } else {
        setError('Failed to load your account applications. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSystemUser) {
      loadApplications();
    } else {
      setLoading(false);
    }
  }, [isSystemUser, loadApplications]);

  const handleCopyId = (id) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case 'APPROVED':
        return <span className="badge badge-success">APPROVED</span>;
      case 'REJECTED':
        return <span className="badge badge-danger">REJECTED</span>;
      case 'PENDING':
      default:
        return <span className="badge badge-warning">PENDING</span>;
    }
  };

  const hasPendingApplication = applications.some((app) => app.status === 'PENDING');

  if (isSystemUser) {
    return (
      <div className="page-container">
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <h3>System User Portal</h3>
            <p style={{ color: '#64748b', marginTop: '0.5rem' }}>
              System administrators review and manage customer applications in the Application Review
              portal.
            </p>
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              <Link to="/system/applications" className="btn btn-primary">
                Review Customer Applications
              </Link>
              <Link to="/system/funds" className="btn btn-secondary">
                Fund Management
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header page-header-row">
        <div>
          <h1>My Account Applications</h1>
          <p>Track the status of your submitted account opening requests.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link to="/accounts" className="btn btn-secondary">
            Your Accounts
          </Link>
          <Link
            to="/accounts/open"
            className="btn btn-primary"
            style={{
              pointerEvents: hasPendingApplication ? 'none' : 'auto',
              opacity: hasPendingApplication ? 0.6 : 1,
            }}
            title={hasPendingApplication ? 'You already have a pending application' : 'Open a new account'}
          >
            + Open New Account
          </Link>
        </div>
      </div>

      {hasPendingApplication && (
        <div className="notice-box" style={{ borderLeftColor: '#d97706', backgroundColor: '#fffbeb' }}>
          <strong>Notice:</strong> You currently have an active pending application undergoing verification. Only one pending application is permitted at a time.
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            style={{ marginLeft: '1rem' }}
            onClick={loadApplications}
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <span className="spinner-inline" style={{ width: '28px', height: '28px' }} />
            <p style={{ marginTop: '1rem', color: '#64748b' }}>Loading your applications...</p>
          </div>
        </div>
      ) : applications.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3>No Applications Found</h3>
          <p>
            You have not submitted any account opening applications yet. Submit an application with
            your details to open a new deposit account.
          </p>
          <Link to="/accounts/open" className="btn btn-primary">
            + Open Your First Account
          </Link>
        </div>
      ) : (
        <div className="applications-grid">
          {applications.map((app) => {
            const createdAccId = app.createdAccount?._id || app.createdAccount;

            return (
              <div key={app._id} className="application-item-card">
                <div className="app-card-header">
                  <div className="app-title-group">
                    <span className="app-type">
                      {app.accountType === 'SAVINGS' ? 'Savings Account Application' : 'Current Account Application'}
                    </span>
                  </div>
                  <div>{getStatusBadge(app.status)}</div>
                </div>

                <div className="app-card-body">
                  <div className="meta-block">
                    <span className="meta-label">Application ID</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <span className="meta-value mono">{app._id}</span>
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
                        onClick={() => handleCopyId(app._id)}
                      >
                        {copiedId === app._id ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="meta-block">
                    <span className="meta-label">Applicant Name</span>
                    <span className="meta-value">{app.fullName}</span>
                  </div>

                  <div className="meta-block">
                    <span className="meta-label">Initial Deposit</span>
                    <span className="meta-value deposit">
                      {formatCurrency(app.initialDeposit, app.currency || 'INR')}
                    </span>
                  </div>

                  <div className="meta-block">
                    <span className="meta-label">KYC Document</span>
                    <span className="meta-value">
                      {app.idType} ({app.idNumber ? `••••${app.idNumber.slice(-4)}` : '—'})
                    </span>
                  </div>

                  <div className="meta-block">
                    <span className="meta-label">Contact</span>
                    <span className="meta-value">{app.mobileNumber}</span>
                  </div>

                  <div className="meta-block">
                    <span className="meta-label">Location</span>
                    <span className="meta-value">
                      {app.city}, {app.state} ({app.pinCode})
                    </span>
                  </div>

                  {/* Approved Account Details Banner */}
                  {app.status === 'APPROVED' && (
                    <div className="meta-block" style={{ gridColumn: '1 / -1' }}>
                      <div className="approved-account-box">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div>
                            <span className="box-title">✓ Account Created & Active</span>
                            <div style={{ marginTop: '2px' }}>
                              Account Number:{' '}
                              <strong className="box-account-id">{createdAccId || 'ACTIVE'}</strong>
                              {createdAccId && (
                                <button
                                  type="button"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    color: '#059669',
                                    marginLeft: '0.5rem',
                                    textDecoration: 'underline',
                                  }}
                                  onClick={() => handleCopyId(createdAccId)}
                                >
                                  {copiedId === createdAccId ? 'Copied!' : 'Copy Account Number'}
                                </button>
                              )}
                            </div>
                          </div>

                          <Link to="/accounts" className="btn btn-sm btn-primary">
                            View Your Accounts →
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rejection Reason Alert */}
                  {app.status === 'REJECTED' && (
                    <div className="meta-block" style={{ gridColumn: '1 / -1' }}>
                      <div className="rejection-callout">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div>
                            <span className="callout-title">✕ Application Rejected</span>
                            <div className="callout-text" style={{ marginTop: '4px' }}>
                              {app.rejectionReason || 'No specific reason provided.'}
                            </div>
                          </div>

                          <Link to="/accounts/open" className="btn btn-sm btn-secondary">
                            Submit New Application
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="app-card-footer">
                  <span>Submitted on: <strong>{formatDate(app.createdAt)}</strong></span>
                  <span>
                    Status: <strong>{app.status || 'PENDING'}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AccountApplications;

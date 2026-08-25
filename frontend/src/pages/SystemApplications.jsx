import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { accountApplicationService } from '../services/accountApplication.service';
import { formatCurrency, formatDate } from '../utils/formatters';

export function SystemApplications() {
  const { user } = useAuth();
  const isSystemUser = user?.systemUser === true;

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [selectedStatusTab, setSelectedStatusTab] = useState('ALL');

  // Modal States
  const [reviewApp, setReviewApp] = useState(null);
  const [approveConfirmApp, setApproveConfirmApp] = useState(null);
  const [rejectApp, setRejectApp] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [modalError, setModalError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await accountApplicationService.getSystemApplications();
      const list = Array.isArray(data?.applications) ? data.applications : [];
      setApplications(list);
    } catch (err) {
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else if (err.request && !err.response) {
        setError('Unable to connect to the server. Please check your network connection.');
      } else {
        setError('Failed to load customer account applications. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSystemUser) {
      loadApplications();
    } else {
      setLoading(false);
    }
  }, [isSystemUser, loadApplications]);

  // Counts for filter tabs
  const counts = useMemo(() => {
    const total = applications.length;
    const pending = applications.filter((a) => a.status === 'PENDING').length;
    const approved = applications.filter((a) => a.status === 'APPROVED').length;
    const rejected = applications.filter((a) => a.status === 'REJECTED').length;
    return { total, pending, approved, rejected };
  }, [applications]);

  // Filtered applications based on active tab
  const filteredApplications = useMemo(() => {
    if (selectedStatusTab === 'ALL') return applications;
    return applications.filter((a) => a.status === selectedStatusTab);
  }, [applications, selectedStatusTab]);

  const handleCopyId = (id) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const maskIdNumber = (idNum) => {
    if (!idNum) return '—';
    const str = String(idNum).trim();
    if (str.length <= 4) return `••••${str}`;
    return `••••••••${str.slice(-4)}`;
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

  // Open Review Details Modal
  const openReviewModal = (app) => {
    setReviewApp(app);
    setModalError('');
  };

  // Open Approve Confirmation
  const openApproveModal = (app) => {
    setApproveConfirmApp(app);
    setModalError('');
  };

  // Open Reject Modal
  const openRejectModal = (app) => {
    setRejectApp(app);
    setRejectionReason('');
    setModalError('');
  };

  const closeAllModals = () => {
    if (isProcessing) return;
    setReviewApp(null);
    setApproveConfirmApp(null);
    setRejectApp(null);
    setRejectionReason('');
    setModalError('');
  };

  // Execute Approval
  const handleConfirmApproval = async () => {
    if (!approveConfirmApp || isProcessing) return;

    setIsProcessing(true);
    setModalError('');
    setActionSuccess('');

    try {
      const response = await accountApplicationService.approveApplication(approveConfirmApp._id);
      const createdAccId = response?.account?._id || response?.application?.createdAccount;

      setActionSuccess(
        `Application for "${approveConfirmApp.fullName}" approved successfully! Created Account Number: ${createdAccId || 'ACTIVE'}`
      );

      closeAllModals();
      await loadApplications();
    } catch (err) {
      if (err.response?.data?.message) {
        setModalError(err.response.data.message);
      } else {
        setModalError('Failed to approve application. Please try again.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute Rejection
  const handleConfirmRejection = async () => {
    if (!rejectApp || isProcessing) return;

    if (!rejectionReason.trim()) {
      setModalError('Please enter a non-empty rejection reason.');
      return;
    }

    setIsProcessing(true);
    setModalError('');
    setActionSuccess('');

    try {
      await accountApplicationService.rejectApplication(rejectApp._id, rejectionReason.trim());

      setActionSuccess(`Application for "${rejectApp.fullName}" has been rejected.`);

      closeAllModals();
      await loadApplications();
    } catch (err) {
      if (err.response?.data?.message) {
        setModalError(err.response.data.message);
      } else {
        setModalError('Failed to reject application. Please try again.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isSystemUser) {
    return (
      <div className="page-container">
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <h3>Access Restricted</h3>
            <p style={{ color: '#64748b', marginTop: '0.5rem' }}>
              This portal is restricted to authenticated SYSTEM administrators.
            </p>
            <div style={{ marginTop: '1.5rem' }}>
              <Link to="/accounts" className="btn btn-primary">
                Back to Your Accounts
              </Link>
            </div>
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
          <h1>Customer Account Applications</h1>
          <p>Review, verify, and approve or reject customer account opening applications.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadApplications}
            disabled={loading}
          >
            {loading ? <span className="spinner-inline" /> : '↻ Refresh'}
          </button>
          <Link to="/system/funds" className="btn btn-secondary">
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
            onClick={loadApplications}
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="filter-tabs-bar">
        <button
          type="button"
          className={`filter-tab-btn ${selectedStatusTab === 'ALL' ? 'active' : ''}`}
          onClick={() => setSelectedStatusTab('ALL')}
        >
          All Applications <span className="count-pill">{counts.total}</span>
        </button>
        <button
          type="button"
          className={`filter-tab-btn ${selectedStatusTab === 'PENDING' ? 'active' : ''}`}
          onClick={() => setSelectedStatusTab('PENDING')}
        >
          Pending Review <span className="count-pill count-pending">{counts.pending}</span>
        </button>
        <button
          type="button"
          className={`filter-tab-btn ${selectedStatusTab === 'APPROVED' ? 'active' : ''}`}
          onClick={() => setSelectedStatusTab('APPROVED')}
        >
          Approved <span className="count-pill count-approved">{counts.approved}</span>
        </button>
        <button
          type="button"
          className={`filter-tab-btn ${selectedStatusTab === 'REJECTED' ? 'active' : ''}`}
          onClick={() => setSelectedStatusTab('REJECTED')}
        >
          Rejected <span className="count-pill count-rejected">{counts.rejected}</span>
        </button>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <span className="spinner-inline" style={{ width: '28px', height: '28px' }} />
            <p style={{ marginTop: '1rem', color: '#64748b' }}>Loading customer applications...</p>
          </div>
        </div>
      ) : filteredApplications.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3>No {selectedStatusTab !== 'ALL' ? selectedStatusTab.toLowerCase() : ''} Applications</h3>
          <p>
            There are currently no customer account opening applications in this category.
          </p>
        </div>
      ) : (
        <div className="applications-grid">
          {filteredApplications.map((app) => (
            <div key={app._id} className="application-item-card">
              <div className="app-card-header">
                <div className="app-title-group">
                  <span className="app-type">{app.fullName}</span>
                  <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                    ({app.accountType === 'SAVINGS' ? 'Savings' : 'Current'})
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {getStatusBadge(app.status)}
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => openReviewModal(app)}
                  >
                    View Details
                  </button>
                  {app.status === 'PENDING' && (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => openApproveModal(app)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                          backgroundColor: '#fee2e2',
                          color: '#991b1b',
                          borderColor: '#fca5a5',
                        }}
                        onClick={() => openRejectModal(app)}
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="app-card-body">
                <div className="meta-block">
                  <span className="meta-label">Email & Contact</span>
                  <span className="meta-value">{app.email}</span>
                  <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>{app.mobileNumber}</span>
                </div>

                <div className="meta-block">
                  <span className="meta-label">KYC Document</span>
                  <span className="meta-value">
                    {app.idType}: {maskIdNumber(app.idNumber)}
                  </span>
                </div>

                <div className="meta-block">
                  <span className="meta-label">Initial Deposit</span>
                  <span className="meta-value deposit">
                    {formatCurrency(app.initialDeposit, app.currency || 'INR')}
                  </span>
                </div>

                <div className="meta-block">
                  <span className="meta-label">Address</span>
                  <span className="meta-value">
                    {app.city}, {app.state} ({app.pinCode})
                  </span>
                </div>

                {app.status === 'APPROVED' && (
                  <div className="meta-block" style={{ gridColumn: '1 / -1' }}>
                    <div className="approved-account-box">
                      <span className="box-title">Created Active Account:</span>
                      <span className="box-account-id">
                        {app.createdAccount?._id || app.createdAccount || 'Created'}
                      </span>
                    </div>
                  </div>
                )}

                {app.status === 'REJECTED' && app.rejectionReason && (
                  <div className="meta-block" style={{ gridColumn: '1 / -1' }}>
                    <div className="rejection-callout">
                      <span className="callout-title">Rejection Reason:</span>
                      <span className="callout-text">{app.rejectionReason}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="app-card-footer">
                <span>
                  App ID: <strong className="mono">{app._id}</strong>
                </span>
                <span>Submitted: {formatDate(app.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. Review & Details Modal */}
      {/* ========================================================================= */}
      {reviewApp && (
        <div className="modal-backdrop" onClick={closeAllModals}>
          <div className="modal-dialog modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Account Application Review</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeAllModals}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* Application Status Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>
                    Application ID:{' '}
                  </span>
                  <strong className="mono">{reviewApp._id}</strong>
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      color: '#0284c7',
                      marginLeft: '0.5rem',
                    }}
                    onClick={() => handleCopyId(reviewApp._id)}
                  >
                    {copiedId === reviewApp._id ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <div>{getStatusBadge(reviewApp.status)}</div>
              </div>

              {/* Personal Information */}
              <div className="review-section">
                <span className="review-section-title">A. Personal Information</span>
                <div className="review-grid">
                  <div className="review-item">
                    <span className="review-label">Full Name</span>
                    <span className="review-value">{reviewApp.fullName}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Date of Birth</span>
                    <span className="review-value">{formatDate(reviewApp.dateOfBirth)}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Gender</span>
                    <span className="review-value">{reviewApp.gender}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Mobile Number</span>
                    <span className="review-value">{reviewApp.mobileNumber}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Email Address</span>
                    <span className="review-value">{reviewApp.email}</span>
                  </div>
                </div>
              </div>

              {/* Address Details */}
              <div className="review-section">
                <span className="review-section-title">B. Residential Address</span>
                <div className="review-grid">
                  <div className="review-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="review-label">Address Line</span>
                    <span className="review-value">{reviewApp.address}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">City</span>
                    <span className="review-value">{reviewApp.city}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">State</span>
                    <span className="review-value">{reviewApp.state}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">PIN Code</span>
                    <span className="review-value">{reviewApp.pinCode}</span>
                  </div>
                </div>
              </div>

              {/* KYC & Identity */}
              <div className="review-section">
                <span className="review-section-title">C. KYC & Identity Verification</span>
                <div className="review-grid">
                  <div className="review-item">
                    <span className="review-label">Document Type</span>
                    <span className="review-value">{reviewApp.idType}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Masked ID Number</span>
                    <span className="review-value mono">{maskIdNumber(reviewApp.idNumber)}</span>
                  </div>
                </div>
              </div>

              {/* Account Requirements */}
              <div className="review-section">
                <span className="review-section-title">D. Requested Account</span>
                <div className="review-grid">
                  <div className="review-item">
                    <span className="review-label">Account Type</span>
                    <span className="review-value">
                      {reviewApp.accountType === 'SAVINGS' ? 'Savings Account' : 'Current Account'}
                    </span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Currency</span>
                    <span className="review-value">{reviewApp.currency || 'INR'}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Initial Deposit</span>
                    <span className="review-value highlight">
                      {formatCurrency(reviewApp.initialDeposit, reviewApp.currency || 'INR')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Audit / Status Info */}
              {reviewApp.status === 'APPROVED' && (
                <div className="approved-account-box">
                  <span className="box-title">✓ Approved Application</span>
                  <div>
                    Created Deposit Account:{' '}
                    <strong className="mono">
                      {reviewApp.createdAccount?._id || reviewApp.createdAccount || 'Active'}
                    </strong>
                  </div>
                  {reviewApp.reviewedAt && (
                    <div style={{ fontSize: '0.75rem', color: '#065f46', marginTop: '2px' }}>
                      Approved on: {formatDate(reviewApp.reviewedAt)}
                    </div>
                  )}
                </div>
              )}

              {reviewApp.status === 'REJECTED' && (
                <div className="rejection-callout">
                  <span className="callout-title">✕ Rejected Application</span>
                  <div>Reason: {reviewApp.rejectionReason || 'No specific reason recorded.'}</div>
                  {reviewApp.reviewedAt && (
                    <div style={{ fontSize: '0.75rem', color: '#991b1b', marginTop: '2px' }}>
                      Rejected on: {formatDate(reviewApp.reviewedAt)}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closeAllModals}>
                Close
              </button>
              {reviewApp.status === 'PENDING' && (
                <>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      backgroundColor: '#fee2e2',
                      color: '#991b1b',
                      borderColor: '#fca5a5',
                    }}
                    onClick={() => {
                      const target = reviewApp;
                      closeAllModals();
                      openRejectModal(target);
                    }}
                  >
                    Reject Application
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      const target = reviewApp;
                      closeAllModals();
                      openApproveModal(target);
                    }}
                  >
                    Approve Application
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. Approve Confirmation Modal */}
      {/* ========================================================================= */}
      {approveConfirmApp && (
        <div className="modal-backdrop" onClick={closeAllModals}>
          <div className="modal-dialog modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Approve Account Application</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeAllModals}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {modalError && (
                <div className="alert alert-error" role="alert">
                  {modalError}
                </div>
              )}

              <p style={{ fontSize: '0.9375rem', lineHeight: 1.5, color: '#334155' }}>
                Are you sure you want to approve the account opening application for{' '}
                <strong>{approveConfirmApp.fullName}</strong>?
              </p>

              <div className="notice-box">
                <strong>Action Effect:</strong> Approving this application will transition status to{' '}
                <strong>APPROVED</strong> and create a live <strong>ACTIVE</strong> deposit account
                linked to this customer.
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeAllModals}
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmApproval}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <span className="spinner-inline" /> Approving...
                  </>
                ) : (
                  'Confirm & Approve'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. Reject Modal with Mandatory Reason */}
      {/* ========================================================================= */}
      {rejectApp && (
        <div className="modal-backdrop" onClick={closeAllModals}>
          <div className="modal-dialog modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reject Account Application</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeAllModals}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {modalError && (
                <div className="alert alert-error" role="alert">
                  {modalError}
                </div>
              )}

              <p style={{ fontSize: '0.9375rem', color: '#334155' }}>
                Rejecting application for <strong>{rejectApp.fullName}</strong>.
              </p>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="rejectionReason">
                  Rejection Reason <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                  id="rejectionReason"
                  rows={4}
                  placeholder="e.g. KYC document verification failed: Aadhaar number mismatch."
                  value={rejectionReason}
                  onChange={(e) => {
                    setRejectionReason(e.target.value);
                    if (modalError) setModalError('');
                  }}
                  disabled={isProcessing}
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontFamily: 'inherit',
                    fontSize: '0.875rem',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeAllModals}
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                }}
                onClick={handleConfirmRejection}
                disabled={isProcessing || !rejectionReason.trim()}
              >
                {isProcessing ? (
                  <>
                    <span className="spinner-inline" /> Rejecting...
                  </>
                ) : (
                  'Reject Application'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SystemApplications;

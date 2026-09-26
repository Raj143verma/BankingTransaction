import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { beneficiaryService } from '../services/beneficiary.service';
import { accountService } from '../services/account.service';
import { formatCurrency, formatDate } from '../utils/formatters';

export function Beneficiaries() {
  const navigate = useNavigate();

  // Data states
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // User Accounts (for source account picker)
  const [accounts, setAccounts] = useState([]);

  // Limits summary state
  const [limits, setLimits] = useState(null);

  // Add Beneficiary Modal & Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalStep, setModalStep] = useState(1); // 1: Form, 2: Confirmation
  const [formData, setFormData] = useState({
    sourceAccount: '',
    toAccount: '',
    nickname: '',
    maxTransferLimit: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Remove confirmation modal
  const [beneficiaryToDelete, setBeneficiaryToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Action busy states
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Load Beneficiaries & Limits
  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [beneficiaryData, accountData, limitsData] = await Promise.all([
        beneficiaryService.getBeneficiaries(),
        accountService.getAccounts(),
        beneficiaryService.getTransferLimits(),
      ]);

      const bList = Array.isArray(beneficiaryData?.beneficiaries) ? beneficiaryData.beneficiaries : [];
      setBeneficiaries(bList);

      const accList = Array.isArray(accountData?.accounts) ? accountData.accounts.filter(a => a.status === 'ACTIVE') : [];
      setAccounts(accList);

      if (accList.length > 0 && !formData.sourceAccount) {
        setFormData(prev => ({ ...prev, sourceAccount: accList[0]._id }));
      }

      setLimits(limitsData?.limits || null);
    } catch (err) {
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('Failed to load beneficiaries. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [formData.sourceAccount]);

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Form validation
  const validateForm = () => {
    const errors = {};
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;

    if (!formData.sourceAccount) {
      errors.sourceAccount = 'Please select a source account';
    }

    const trimmedTo = formData.toAccount.trim();
    if (!trimmedTo) {
      errors.toAccount = 'Destination account ID is required';
    } else if (!objectIdRegex.test(trimmedTo)) {
      errors.toAccount = 'Destination account ID must be a valid 24-character hexadecimal ID';
    } else if (trimmedTo === formData.sourceAccount) {
      errors.toAccount = 'Destination account cannot be the same as source account';
    }

    const trimmedNick = formData.nickname.trim();
    if (!trimmedNick) {
      errors.nickname = 'Beneficiary nickname is required';
    } else if (trimmedNick.length < 2) {
      errors.nickname = 'Nickname must be at least 2 characters';
    } else if (trimmedNick.length > 100) {
      errors.nickname = 'Nickname cannot exceed 100 characters';
    }

    if (formData.maxTransferLimit) {
      const num = Number(formData.maxTransferLimit);
      if (isNaN(num) || num <= 0) {
        errors.maxTransferLimit = 'Transfer limit must be a positive number';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = (e) => {
    e.preventDefault();
    if (validateForm()) {
      setModalStep(2);
    }
  };

  const handleCreateBeneficiary = async () => {
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        sourceAccount: formData.sourceAccount,
        toAccount: formData.toAccount.trim(),
        nickname: formData.nickname.trim(),
        maxTransferLimit: formData.maxTransferLimit ? Number(formData.maxTransferLimit) : null,
      };

      const res = await beneficiaryService.createBeneficiary(payload);
      setSuccessMsg(res.message || 'Beneficiary added successfully');
      setShowAddModal(false);
      setModalStep(1);
      setFormData({
        sourceAccount: accounts[0]?._id || '',
        toAccount: '',
        nickname: '',
        maxTransferLimit: '',
      });
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add beneficiary. Please check the details and try again.');
      setModalStep(1);
    } finally {
      setSubmitting(false);
    }
  };

  // Status Action Handlers
  const handleActivate = async (id) => {
    setActionLoadingId(id);
    setError('');
    setSuccessMsg('');
    try {
      const res = await beneficiaryService.activateBeneficiary(id);
      setSuccessMsg(res.message || 'Beneficiary activated successfully');
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to activate beneficiary');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeactivate = async (id) => {
    setActionLoadingId(id);
    setError('');
    setSuccessMsg('');
    try {
      const res = await beneficiaryService.deactivateBeneficiary(id);
      setSuccessMsg(res.message || 'Beneficiary deactivated successfully');
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to deactivate beneficiary');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteBeneficiary = async () => {
    if (!beneficiaryToDelete) return;
    setDeleting(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await beneficiaryService.removeBeneficiary(beneficiaryToDelete._id);
      setSuccessMsg(res.message || 'Beneficiary removed successfully');
      setBeneficiaryToDelete(null);
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove beneficiary');
    } finally {
      setDeleting(false);
    }
  };

  const getStatusBadge = (b) => {
    if (b.status === 'ACTIVE') {
      return <span className="badge badge-success">ACTIVE</span>;
    }
    if (b.status === 'COOLING_OFF') {
      const isExpired = b.coolingOffExpiresAt && new Date(b.coolingOffExpiresAt) <= new Date();
      if (isExpired) {
        return <span className="badge badge-info">COOLING COMPLETED</span>;
      }
      return (
        <span className="badge badge-warning" title={`Cooling off until ${b.coolingOffExpiresAt ? new Date(b.coolingOffExpiresAt).toLocaleTimeString() : ''}`}>
          COOLING OFF
        </span>
      );
    }
    if (b.status === 'INACTIVE') {
      return <span className="badge badge-secondary">INACTIVE</span>;
    }
    return <span className="badge badge-danger">{b.status}</span>;
  };

  return (
    <div className="page-container">
      {/* Header Banner */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Beneficiary Directory</h1>
          <p>Manage verified transfer beneficiaries and configure account transfer controls.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setShowAddModal(true);
            setModalStep(1);
            setError('');
          }}
          disabled={accounts.length === 0}
        >
          + Add Beneficiary
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: '1.5rem' }}>
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-secondary" style={{ marginLeft: '1rem' }} onClick={() => setError('')}>
            Dismiss
          </button>
        </div>
      )}

      {successMsg && (
        <div className="alert alert-success" role="alert" style={{ marginBottom: '1.5rem' }}>
          <span>{successMsg}</span>
          <button type="button" className="btn btn-sm btn-secondary" style={{ marginLeft: '1rem' }} onClick={() => setSuccessMsg('')}>
            Dismiss
          </button>
        </div>
      )}

      {/* Transfer Limits Overview Card */}
      {limits && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Security & Transfer Limits</h3>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Authoritative Daily Allowances</span>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Per-Transaction Limit
                </span>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e3a8a', marginTop: '0.25rem' }}>
                  {formatCurrency(limits.perTransactionLimit)}
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Max amount per single transfer</span>
              </div>

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Remaining Daily Amount
                </span>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#059669', marginTop: '0.25rem' }}>
                  {formatCurrency(limits.remainingDailyAmount)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  <span>Spent: {formatCurrency(limits.dailySpent)}</span>
                  <span>Limit: {formatCurrency(limits.dailyAmountLimit)}</span>
                </div>
                {/* Progress bar */}
                <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', marginTop: '0.5rem', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, Math.round((limits.dailySpent / limits.dailyAmountLimit) * 100))}%`,
                      background: limits.dailySpent > limits.dailyAmountLimit * 0.8 ? '#dc2626' : '#1e3a8a',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Remaining Daily Transfers
                </span>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e3a8a', marginTop: '0.25rem' }}>
                  {limits.remainingDailyCount} / {limits.dailyCountLimit}
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {limits.dailyCount} transfers initiated today
                </span>
              </div>

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  New Beneficiary Cooling
                </span>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#d97706', marginTop: '0.25rem' }}>
                  {limits.beneficiaryCooldownMinutes} mins
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Security delay for newly added payees</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Beneficiaries List / Table */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Verified Payees ({beneficiaries.length})</h3>
          <button type="button" className="btn btn-sm btn-secondary" onClick={loadData} disabled={loading}>
            Refresh
          </button>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <span className="spinner-inline" style={{ width: '28px', height: '28px' }} />
              <p style={{ marginTop: '1rem', color: '#64748b' }}>Loading beneficiaries...</p>
            </div>
          ) : beneficiaries.length === 0 ? (
            <div className="empty-state" style={{ padding: '3rem 1.5rem' }}>
              <div className="empty-state-icon">👥</div>
              <h3>No Beneficiaries Added</h3>
              <p>Add trusted payee accounts to streamline funds transfers and enforce custom limits.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowAddModal(true)}
                disabled={accounts.length === 0}
              >
                + Add Your First Beneficiary
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Beneficiary Details</th>
                    <th>Destination Account</th>
                    <th>Source Account</th>
                    <th>Custom Limit</th>
                    <th>Status</th>
                    <th>Added On</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {beneficiaries.map((b) => {
                    const isCooling = b.status === 'COOLING_OFF';
                    const cooldownPassed = isCooling && b.coolingOffExpiresAt && new Date(b.coolingOffExpiresAt) <= new Date();
                    const targetAccId = b.account?._id || b.account || '';
                    const sourceAccId = b.sourceAccount?._id || b.sourceAccount || '';

                    return (
                      <tr key={b._id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                background: '#eff6ff',
                                color: '#1e3a8a',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.875rem',
                              }}
                            >
                              {(b.nickname || 'B').slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <strong style={{ display: 'block', color: '#0f172a' }}>{b.nickname}</strong>
                              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                {b.accountHolderName || b.account?.accountHolderName || 'Account Holder'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <code style={{ fontSize: '0.8125rem' }}>{targetAccId}</code>
                          <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b' }}>
                            {b.accountType || b.account?.accountType || 'SAVINGS'} • {b.currency || 'INR'}
                          </span>
                        </td>
                        <td>
                          <code style={{ fontSize: '0.8125rem' }}>{sourceAccId}</code>
                        </td>
                        <td>
                          {b.maxTransferLimit ? (
                            <span style={{ fontWeight: 600, color: '#1e3a8a' }}>
                              {formatCurrency(b.maxTransferLimit)}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>Default (₹50,000)</span>
                          )}
                        </td>
                        <td>
                          {getStatusBadge(b)}
                          {isCooling && !cooldownPassed && b.coolingOffExpiresAt && (
                            <span style={{ display: 'block', fontSize: '0.6875rem', color: '#d97706', marginTop: '2px' }}>
                              Until {new Date(b.coolingOffExpiresAt).toLocaleTimeString()}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                          {formatDate(b.createdAt)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                            {b.status === 'ACTIVE' && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  onClick={() => navigate(`/transactions?toAccount=${targetAccId}`)}
                                >
                                  Transfer
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => handleDeactivate(b._id)}
                                  disabled={actionLoadingId === b._id}
                                >
                                  {actionLoadingId === b._id ? 'Updating...' : 'Deactivate'}
                                </button>
                              </>
                            )}

                            {(b.status === 'INACTIVE' || cooldownPassed) && (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => handleActivate(b._id)}
                                disabled={actionLoadingId === b._id}
                              >
                                {actionLoadingId === b._id ? 'Activating...' : 'Activate'}
                              </button>
                            )}

                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() => setBeneficiaryToDelete(b)}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Beneficiary Modal */}
      {showAddModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-content card" style={{ maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>{modalStep === 1 ? 'Add New Beneficiary' : 'Confirm Beneficiary Details'}</h3>
              <button
                type="button"
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b' }}
                onClick={() => setShowAddModal(false)}
              >
                &times;
              </button>
            </div>

            <div className="card-body">
              {modalStep === 1 ? (
                <form onSubmit={handleNextStep} noValidate>
                  <div className="form-group">
                    <label htmlFor="modal-sourceAccount">Source Account</label>
                    <select
                      id="modal-sourceAccount"
                      value={formData.sourceAccount}
                      onChange={(e) => setFormData({ ...formData, sourceAccount: e.target.value })}
                      className={formErrors.sourceAccount ? 'input-error' : ''}
                    >
                      {accounts.map((acc) => (
                        <option key={acc._id} value={acc._id}>
                          {acc._id} ({acc.currency || 'INR'})
                        </option>
                      ))}
                    </select>
                    {formErrors.sourceAccount && <span className="form-error">{formErrors.sourceAccount}</span>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="modal-toAccount">Destination Account ID</label>
                    <input
                      id="modal-toAccount"
                      type="text"
                      placeholder="e.g. 64b8f0a2e3b1c9d4e5f6a7b8"
                      value={formData.toAccount}
                      onChange={(e) => setFormData({ ...formData, toAccount: e.target.value })}
                      className={formErrors.toAccount ? 'input-error' : ''}
                    />
                    {formErrors.toAccount && <span className="form-error">{formErrors.toAccount}</span>}
                    <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                      Must be a valid active customer account ID.
                    </span>
                  </div>

                  <div className="form-group">
                    <label htmlFor="modal-nickname">Payee Nickname / Label</label>
                    <input
                      id="modal-nickname"
                      type="text"
                      placeholder="e.g. John Doe - Rent"
                      value={formData.nickname}
                      onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                      className={formErrors.nickname ? 'input-error' : ''}
                    />
                    {formErrors.nickname && <span className="form-error">{formErrors.nickname}</span>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="modal-limit">Custom Transfer Limit (₹ Optional)</label>
                    <input
                      id="modal-limit"
                      type="number"
                      placeholder="e.g. 25000 (Leave empty for system limit)"
                      value={formData.maxTransferLimit}
                      onChange={(e) => setFormData({ ...formData, maxTransferLimit: e.target.value })}
                      className={formErrors.maxTransferLimit ? 'input-error' : ''}
                      min="1"
                    />
                    {formErrors.maxTransferLimit && <span className="form-error">{formErrors.maxTransferLimit}</span>}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Continue to Review
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
                    <div style={{ marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Nickname</span>
                      <strong>{formData.nickname}</strong>
                    </div>
                    <div style={{ marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Destination Account</span>
                      <code>{formData.toAccount}</code>
                    </div>
                    <div style={{ marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Source Account</span>
                      <code>{formData.sourceAccount}</code>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>Configured Limit</span>
                      <strong>{formData.maxTransferLimit ? formatCurrency(Number(formData.maxTransferLimit)) : 'System Default Limit'}</strong>
                    </div>
                  </div>

                  {limits?.beneficiaryCooldownMinutes > 0 && (
                    <div className="alert alert-warning" style={{ fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
                      <strong>Security Cooling Period:</strong> Newly added payees undergo a {limits.beneficiaryCooldownMinutes}-minute cooling-off period before funds transfers are permitted.
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setModalStep(1)} disabled={submitting}>
                      Back
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleCreateBeneficiary} disabled={submitting}>
                      {submitting ? 'Adding Payee...' : 'Confirm & Add Payee'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirmation Modal */}
      {beneficiaryToDelete && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="modal-content card" style={{ maxWidth: '420px', width: '100%' }}>
            <div className="card-header">
              <h3>Remove Beneficiary</h3>
            </div>
            <div className="card-body">
              <p>
                Are you sure you want to remove <strong>{beneficiaryToDelete.nickname}</strong> ({beneficiaryToDelete.account?._id || beneficiaryToDelete.account})?
              </p>
              <p style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.5rem' }}>
                You will need to re-add and re-verify this payee to make transfers in the future.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setBeneficiaryToDelete(null)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDeleteBeneficiary}
                  disabled={deleting}
                >
                  {deleting ? 'Removing...' : 'Yes, Remove'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Beneficiaries;

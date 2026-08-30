import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services/auth.service';
import { formatDate } from '../utils/formatters';

export function SecuritySettings() {
  const { user } = useAuth();
  const isSystemUser = user?.systemUser === true;

  // Session & Security Status
  const [sessionStatus, setSessionStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState('');

  // Password Change Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordApiError, setPasswordApiError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Revoke Sessions State
  const [revokeApiError, setRevokeApiError] = useState('');
  const [revokeSuccess, setRevokeSuccess] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);

  // Fetch security status
  const fetchSecurityStatus = useCallback(async () => {
    setLoadingStatus(true);
    setStatusError('');
    try {
      const data = await authService.getSessionStatus();
      if (data && data.session) {
        setSessionStatus(data.session);
      }
    } catch (err) {
      setStatusError(err.response?.data?.message || 'Failed to fetch security and session status');
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchSecurityStatus();
  }, [fetchSecurityStatus]);

  // Client-side password validation
  const validateForm = () => {
    const errors = {};

    if (!currentPassword) {
      errors.currentPassword = 'Current password is required';
    }

    if (!newPassword) {
      errors.newPassword = 'New password is required';
    } else {
      if (newPassword.length < 8) {
        errors.newPassword = 'New password must be at least 8 characters';
      } else if (newPassword.length > 128) {
        errors.newPassword = 'New password cannot exceed 128 characters';
      } else if (!/[A-Z]/.test(newPassword)) {
        errors.newPassword = 'New password must contain at least one uppercase letter';
      } else if (!/[a-z]/.test(newPassword)) {
        errors.newPassword = 'New password must contain at least one lowercase letter';
      } else if (!/[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
        errors.newPassword = 'New password must contain at least one number or special character';
      }

      if (currentPassword && newPassword === currentPassword) {
        errors.newPassword = 'New password cannot be the same as your current password';
      }
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Confirmation password is required';
    } else if (newPassword && confirmPassword !== newPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordApiError('');
    setPasswordSuccess('');

    if (!validateForm()) {
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await authService.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      setPasswordSuccess(response.message || 'Password changed successfully! Previous sessions have been revoked.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordErrors({});
      // Refresh status after password change
      await fetchSecurityStatus();
    } catch (err) {
      setPasswordApiError(err.response?.data?.message || 'Failed to change password. Please verify your current password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleRevokeSessions = async () => {
    setRevokeApiError('');
    setRevokeSuccess('');
    setIsRevoking(true);

    try {
      const response = await authService.revokeSessions();
      setRevokeSuccess(response.message || 'All other active sessions have been successfully revoked.');
      await fetchSecurityStatus();
    } catch (err) {
      setRevokeApiError(err.response?.data?.message || 'Failed to revoke active sessions.');
    } finally {
      setIsRevoking(false);
    }
  };

  // Live password requirements checks
  const reqLength = newPassword.length >= 8 && newPassword.length <= 128;
  const reqUpper = /[A-Z]/.test(newPassword);
  const reqLower = /[a-z]/.test(newPassword);
  const reqDigitOrSymbol = /[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);
  const reqDiff = Boolean(currentPassword && newPassword && currentPassword !== newPassword);

  return (
    <div className="security-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Security & Session Management</h1>
          <p className="page-subtitle">
            Configure authentication credentials, review active session status, and enforce account access controls.
          </p>
        </div>
      </div>

      {/* Security Status Cards */}
      <div className="metrics-grid" style={{ marginBottom: '2rem' }}>
        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Session Health</span>
            <span className="badge badge-success">ACTIVE</span>
          </div>
          <div className="metric-value" style={{ fontSize: '1.25rem' }}>
            Version {sessionStatus?.sessionVersion || 1}
          </div>
          <div className="metric-footer">
            <span>Privilege: {isSystemUser ? 'SYSTEM ADMINISTRATOR' : 'CUSTOMER'}</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Last Authentication</span>
          </div>
          <div className="metric-value" style={{ fontSize: '1rem', wordBreak: 'break-word' }}>
            {sessionStatus?.lastLoginAt ? formatDate(sessionStatus.lastLoginAt) : 'Current Session'}
          </div>
          <div className="metric-footer">
            <span>IP & User-Agent Monitored</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">Password Last Updated</span>
          </div>
          <div className="metric-value" style={{ fontSize: '1rem', wordBreak: 'break-word' }}>
            {sessionStatus?.passwordChangedAt ? formatDate(sessionStatus.passwordChangedAt) : 'Never Changed'}
          </div>
          <div className="metric-footer">
            <span>Bcrypt Hashed (10 Salt Rounds)</span>
          </div>
        </div>
      </div>

      {statusError && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
          {statusError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '2rem' }}>
        {/* Change Password Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Change Account Password</h2>
            <p className="card-subtitle">
              Updating your password will automatically invalidate all existing JWT tokens on other devices.
            </p>
          </div>

          <div className="card-body">
            {passwordSuccess && (
              <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
                ✓ {passwordSuccess}
              </div>
            )}

            {passwordApiError && (
              <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
                ✕ {passwordApiError}
              </div>
            )}

            <form onSubmit={handlePasswordChange} noValidate>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" htmlFor="currentPassword">
                  Current Password <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="currentPassword"
                    type={showCurrentPassword ? 'text' : 'password'}
                    className={`form-control ${passwordErrors.currentPassword ? 'is-invalid' : ''}`}
                    placeholder="Enter your current password"
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      if (passwordErrors.currentPassword) {
                        setPasswordErrors((prev) => ({ ...prev, currentPassword: '' }));
                      }
                    }}
                    disabled={isChangingPassword}
                  />
                  <button
                    type="button"
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                    }}
                    onClick={() => setShowCurrentPassword((prev) => !prev)}
                  >
                    {showCurrentPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {passwordErrors.currentPassword && (
                  <div className="form-error" style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginTop: '0.375rem' }}>
                    {passwordErrors.currentPassword}
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" htmlFor="newPassword">
                  New Password <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="newPassword"
                    type={showNewPassword ? 'text' : 'password'}
                    className={`form-control ${passwordErrors.newPassword ? 'is-invalid' : ''}`}
                    placeholder="Enter strong new password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (passwordErrors.newPassword) {
                        setPasswordErrors((prev) => ({ ...prev, newPassword: '' }));
                      }
                    }}
                    disabled={isChangingPassword}
                  />
                  <button
                    type="button"
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                    }}
                    onClick={() => setShowNewPassword((prev) => !prev)}
                  >
                    {showNewPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {passwordErrors.newPassword && (
                  <div className="form-error" style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginTop: '0.375rem' }}>
                    {passwordErrors.newPassword}
                  </div>
                )}
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label" htmlFor="confirmPassword">
                  Confirm New Password <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    className={`form-control ${passwordErrors.confirmPassword ? 'is-invalid' : ''}`}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (passwordErrors.confirmPassword) {
                        setPasswordErrors((prev) => ({ ...prev, confirmPassword: '' }));
                      }
                    }}
                    disabled={isChangingPassword}
                  />
                  <button
                    type="button"
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                    }}
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {passwordErrors.confirmPassword && (
                  <div className="form-error" style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginTop: '0.375rem' }}>
                    {passwordErrors.confirmPassword}
                  </div>
                )}
              </div>

              {/* Password Requirements Checklist */}
              <div
                style={{
                  background: 'var(--color-bg-subtle, rgba(255,255,255,0.03))',
                  borderRadius: '6px',
                  padding: '1rem',
                  marginBottom: '1.5rem',
                  fontSize: '0.8125rem',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: 'var(--color-text-primary)' }}>
                  Password Security Policy:
                </div>
                <div style={{ display: 'grid', gap: '0.25rem' }}>
                  <div style={{ color: reqLength ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                    {reqLength ? '✓' : '○'} Between 8 and 128 characters
                  </div>
                  <div style={{ color: reqUpper ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                    {reqUpper ? '✓' : '○'} At least one uppercase letter (A-Z)
                  </div>
                  <div style={{ color: reqLower ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                    {reqLower ? '✓' : '○'} At least one lowercase letter (a-z)
                  </div>
                  <div style={{ color: reqDigitOrSymbol ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                    {reqDigitOrSymbol ? '✓' : '○'} At least one digit or special character
                  </div>
                  <div style={{ color: reqDiff ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                    {reqDiff ? '✓' : '○'} Distinct from current password
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={isChangingPassword}
              >
                {isChangingPassword ? 'Updating Password...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>

        {/* Session Revocation Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Session Revocation</h2>
            <p className="card-subtitle">
              Manage active authorization tokens across devices and browsers.
            </p>
          </div>

          <div className="card-body">
            {revokeSuccess && (
              <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
                ✓ {revokeSuccess}
              </div>
            )}

            {revokeApiError && (
              <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
                ✕ {revokeApiError}
              </div>
            )}

            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
              <p style={{ marginBottom: '0.75rem' }}>
                The banking engine maintains server-side <strong>session versioning</strong>. When you revoke active sessions:
              </p>
              <ul style={{ paddingLeft: '1.25rem', margin: '0 0 1rem 0' }}>
                <li>Your account's security session version will be incremented.</li>
                <li>All JWT tokens issued on other browsers, mobile clients, or previous sessions become immediately invalid.</li>
                <li>Your current browser session will automatically receive a fresh token to keep you safely authenticated.</li>
                <li>An immutable security audit event will be recorded.</li>
              </ul>
            </div>

            <div
              style={{
                background: 'var(--color-bg-subtle, rgba(255,255,255,0.03))',
                borderRadius: '6px',
                padding: '1rem',
                marginBottom: '1.5rem',
                border: '1px solid var(--color-border)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Current Security Version:</span>
                <span className="badge badge-info">v{sessionStatus?.sessionVersion || 1}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Brute-Force Shield:</span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-success)' }}>Active (Account Lockout Enabled)</span>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-danger"
              style={{ width: '100%' }}
              onClick={handleRevokeSessions}
              disabled={isRevoking}
            >
              {isRevoking ? 'Revoking Sessions...' : 'Revoke All Other Active Sessions'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

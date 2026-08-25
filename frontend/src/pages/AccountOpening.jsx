import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { accountApplicationService } from '../services/accountApplication.service';
import { formatCurrency, formatDate } from '../utils/formatters';

export function AccountOpening() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isSystemUser = user?.systemUser === true;

  const [formData, setFormData] = useState({
    fullName: user?.name || '',
    dateOfBirth: '',
    gender: 'MALE',
    mobileNumber: '',
    email: user?.email || '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    idType: 'AADHAAR',
    idNumber: '',
    accountType: 'SAVINGS',
    currency: 'INR',
    initialDeposit: '1000',
    confirmAccuracy: false,
    agreeTerms: false,
  });

  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedApplication, setSubmittedApplication] = useState(null);
  const [copiedId, setCopiedId] = useState(false);

  // Form validation function
  const validate = (data = formData) => {
    const newErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const mobileRegex = /^[6-9]\d{9}$/;
    const pinRegex = /^\d{6}$/;

    // Personal Info
    if (!data.fullName.trim()) {
      newErrors.fullName = 'Full Name is required';
    } else if (data.fullName.trim().length < 2) {
      newErrors.fullName = 'Full Name must be at least 2 characters';
    }

    if (!data.dateOfBirth) {
      newErrors.dateOfBirth = 'Date of Birth is required';
    } else {
      const dob = new Date(data.dateOfBirth);
      const today = new Date();
      if (isNaN(dob.getTime())) {
        newErrors.dateOfBirth = 'Please enter a valid date';
      } else if (dob >= today) {
        newErrors.dateOfBirth = 'Date of Birth must be in the past';
      } else {
        const minAgeDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
        if (dob > minAgeDate) {
          newErrors.dateOfBirth = 'Applicant must be at least 18 years old';
        }
      }
    }

    if (!data.gender) {
      newErrors.gender = 'Gender is required';
    }

    if (!data.mobileNumber.trim()) {
      newErrors.mobileNumber = 'Mobile Number is required';
    } else if (!mobileRegex.test(data.mobileNumber.trim()) && !/^\d{10}$/.test(data.mobileNumber.trim())) {
      newErrors.mobileNumber = 'Enter a valid 10-digit mobile number';
    }

    if (!data.email.trim()) {
      newErrors.email = 'Email Address is required';
    } else if (!emailRegex.test(data.email.trim())) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Address
    if (!data.address.trim()) {
      newErrors.address = 'Address Line is required';
    }

    if (!data.city.trim()) {
      newErrors.city = 'City is required';
    }

    if (!data.state.trim()) {
      newErrors.state = 'State is required';
    }

    if (!data.pinCode.trim()) {
      newErrors.pinCode = 'PIN Code is required';
    } else if (!pinRegex.test(data.pinCode.trim())) {
      newErrors.pinCode = 'PIN Code must be a 6-digit number';
    }

    // KYC / Identity
    if (!data.idType) {
      newErrors.idType = 'ID Type is required';
    }

    if (!data.idNumber.trim()) {
      newErrors.idNumber = 'ID Number is required';
    } else if (data.idNumber.trim().length < 3) {
      newErrors.idNumber = 'ID Number must be at least 3 characters';
    }

    // Account Info
    if (!data.accountType) {
      newErrors.accountType = 'Account Type is required';
    }

    const deposit = Number(data.initialDeposit);
    if (!data.initialDeposit || isNaN(deposit) || deposit <= 0) {
      newErrors.initialDeposit = 'Initial deposit must be greater than ₹0';
    }

    // Declarations
    if (!data.confirmAccuracy) {
      newErrors.confirmAccuracy = 'You must confirm accuracy of information';
    }

    if (!data.agreeTerms) {
      newErrors.agreeTerms = 'You must agree to the terms and conditions';
    }

    return newErrors;
  };

  const validationErrors = validate(formData);
  const isFormValid = Object.keys(validationErrors).length === 0;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === 'checkbox' ? checked : value;

    setFormData((prev) => {
      const updated = { ...prev, [name]: val };
      if (touched[name]) {
        setErrors(validate(updated));
      }
      return updated;
    });

    if (apiError) {
      setApiError('');
    }
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors(validate(formData));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setApiError('');
    const currentErrors = validate(formData);

    if (Object.keys(currentErrors).length > 0) {
      // Mark all fields as touched to display errors
      const allTouched = Object.keys(formData).reduce((acc, key) => ({ ...acc, [key]: true }), {});
      setTouched(allTouched);
      setErrors(currentErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        fullName: formData.fullName.trim(),
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        mobileNumber: formData.mobileNumber.trim(),
        email: formData.email.trim(),
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        pinCode: formData.pinCode.trim(),
        idType: formData.idType,
        idNumber: formData.idNumber.trim(),
        accountType: formData.accountType,
        currency: 'INR',
        initialDeposit: Number(formData.initialDeposit),
        confirmAccuracy: Boolean(formData.confirmAccuracy),
        agreeTerms: Boolean(formData.agreeTerms),
      };

      const response = await accountApplicationService.submitApplication(payload);
      if (response && response.application) {
        setSubmittedApplication(response.application);
      }
    } catch (err) {
      if (err.response?.data?.message) {
        setApiError(err.response.data.message);
      } else if (err.request && !err.response) {
        setApiError('Unable to connect to the server. Please check your network connection.');
      } else {
        setApiError('Failed to submit your application. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyId = (id) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    });
  };

  if (isSystemUser) {
    return (
      <div className="page-container">
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <h3>System User Access Notice</h3>
            <p style={{ color: '#64748b', marginTop: '0.5rem' }}>
              System accounts cannot submit customer account opening applications. Use System Fund
              Management to manage institutional funds.
            </p>
            <div style={{ marginTop: '1.5rem' }}>
              <Link to="/system/funds" className="btn btn-primary">
                Go to Fund Management
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 7. Success State Screen
  if (submittedApplication) {
    return (
      <div className="page-container">
        <div className="application-success-card">
          <div className="success-card-header">
            <div className="success-icon-badge">✓</div>
            <h2>Account Opening Application Submitted</h2>
            <p>
              Your application has been submitted successfully and is awaiting verification.
            </p>
          </div>

          <div className="success-card-body">
            <div className="success-details-list">
              <div className="success-row">
                <span className="label">Application ID:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="value mono">{submittedApplication._id}</span>
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
                    onClick={() => handleCopyId(submittedApplication._id)}
                  >
                    {copiedId ? 'Copied!' : 'Copy ID'}
                  </button>
                </div>
              </div>

              <div className="success-row">
                <span className="label">Status:</span>
                <span className="badge badge-warning">
                  {submittedApplication.status || 'PENDING'}
                </span>
              </div>

              <div className="success-row">
                <span className="label">Account Type:</span>
                <span className="value">
                  {submittedApplication.accountType === 'SAVINGS' ? 'Savings Account' : 'Current Account'}
                </span>
              </div>

              <div className="success-row">
                <span className="label">Initial Deposit:</span>
                <span className="value highlight">
                  {formatCurrency(submittedApplication.initialDeposit, submittedApplication.currency || 'INR')}
                </span>
              </div>

              <div className="success-row">
                <span className="label">Applicant Name:</span>
                <span className="value">{submittedApplication.fullName}</span>
              </div>

              <div className="success-row">
                <span className="label">Submitted Date:</span>
                <span className="value">{formatDate(submittedApplication.createdAt)}</span>
              </div>
            </div>

            <div className="notice-box">
              <strong>Next Step:</strong> Your account application will be reviewed by our system administrators. Once approved, your deposit account will be created and activated automatically.
            </div>
          </div>

          <div className="success-card-footer">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/accounts/applications')}
            >
              View My Applications
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/accounts')}
            >
              Back to Accounts
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header page-header-row">
        <div>
          <h1>Open a New Account</h1>
          <p>Complete your details to submit an account opening application.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link to="/accounts/applications" className="btn btn-secondary btn-sm">
            View My Applications
          </Link>
          <Link to="/accounts" className="btn btn-secondary btn-sm">
            Back to Accounts
          </Link>
        </div>
      </div>

      {apiError && (
        <div className="alert alert-error" role="alert">
          <div>
            <strong>Submission Error: </strong>
            <span>{apiError}</span>
          </div>
          {apiError.includes('already have a pending') && (
            <div style={{ marginTop: '0.5rem' }}>
              <Link to="/accounts/applications" className="btn btn-sm btn-primary">
                View My Pending Applications
              </Link>
            </div>
          )}
        </div>
      )}

      <form className="account-opening-layout" onSubmit={handleSubmit} noValidate>
        {/* Section A: Personal Information */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="section-badge">A</span>
            <h3>Personal Information</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid form-grid-2">
              <div className="form-group">
                <label htmlFor="fullName">Full Name *</label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  placeholder="e.g. Johnathan Doe"
                  value={formData.fullName}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  disabled={isSubmitting}
                  className={touched.fullName && errors.fullName ? 'input-error' : ''}
                />
                {touched.fullName && errors.fullName && (
                  <span className="form-error">{errors.fullName}</span>
                )}
              </div>

              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label htmlFor="dateOfBirth">Date of Birth *</label>
                  <input
                    id="dateOfBirth"
                    name="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    disabled={isSubmitting}
                    className={touched.dateOfBirth && errors.dateOfBirth ? 'input-error' : ''}
                  />
                  {touched.dateOfBirth && errors.dateOfBirth && (
                    <span className="form-error">{errors.dateOfBirth}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="gender">Gender *</label>
                  <select
                    id="gender"
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    disabled={isSubmitting}
                    className={touched.gender && errors.gender ? 'input-error' : ''}
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                  {touched.gender && errors.gender && (
                    <span className="form-error">{errors.gender}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="form-grid form-grid-2">
              <div className="form-group">
                <label htmlFor="mobileNumber">Mobile Number *</label>
                <input
                  id="mobileNumber"
                  name="mobileNumber"
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={formData.mobileNumber}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  disabled={isSubmitting}
                  className={touched.mobileNumber && errors.mobileNumber ? 'input-error' : ''}
                />
                {touched.mobileNumber && errors.mobileNumber ? (
                  <span className="form-error">{errors.mobileNumber}</span>
                ) : (
                  <span className="form-hint">10-digit Indian mobile number</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="email">Email Address *</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="e.g. john@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  disabled={isSubmitting}
                  className={touched.email && errors.email ? 'input-error' : ''}
                />
                {touched.email && errors.email && (
                  <span className="form-error">{errors.email}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section B: Address */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="section-badge">B</span>
            <h3>Address Details</h3>
          </div>
          <div className="form-section-body">
            <div className="form-group">
              <label htmlFor="address">Address Line *</label>
              <input
                id="address"
                name="address"
                type="text"
                placeholder="House / Flat No., Street, Area"
                value={formData.address}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={isSubmitting}
                className={touched.address && errors.address ? 'input-error' : ''}
              />
              {touched.address && errors.address && (
                <span className="form-error">{errors.address}</span>
              )}
            </div>

            <div className="form-grid form-grid-3">
              <div className="form-group">
                <label htmlFor="city">City *</label>
                <input
                  id="city"
                  name="city"
                  type="text"
                  placeholder="e.g. Mumbai"
                  value={formData.city}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  disabled={isSubmitting}
                  className={touched.city && errors.city ? 'input-error' : ''}
                />
                {touched.city && errors.city && (
                  <span className="form-error">{errors.city}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="state">State *</label>
                <input
                  id="state"
                  name="state"
                  type="text"
                  placeholder="e.g. Maharashtra"
                  value={formData.state}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  disabled={isSubmitting}
                  className={touched.state && errors.state ? 'input-error' : ''}
                />
                {touched.state && errors.state && (
                  <span className="form-error">{errors.state}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="pinCode">PIN Code *</label>
                <input
                  id="pinCode"
                  name="pinCode"
                  type="text"
                  placeholder="e.g. 400001"
                  maxLength={6}
                  value={formData.pinCode}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  disabled={isSubmitting}
                  className={touched.pinCode && errors.pinCode ? 'input-error' : ''}
                />
                {touched.pinCode && errors.pinCode ? (
                  <span className="form-error">{errors.pinCode}</span>
                ) : (
                  <span className="form-hint">6-digit postal code</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section C: KYC / Identity */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="section-badge">C</span>
            <h3>KYC / Identity Verification</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid form-grid-2">
              <div className="form-group">
                <label htmlFor="idType">ID Type *</label>
                <select
                  id="idType"
                  name="idType"
                  value={formData.idType}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  disabled={isSubmitting}
                  className={touched.idType && errors.idType ? 'input-error' : ''}
                >
                  <option value="AADHAAR">Aadhaar Card</option>
                  <option value="PAN">PAN Card</option>
                  <option value="PASSPORT">Passport</option>
                  <option value="VOTER_ID">Voter ID</option>
                </select>
                {touched.idType && errors.idType && (
                  <span className="form-error">{errors.idType}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="idNumber">ID Number *</label>
                <input
                  id="idNumber"
                  name="idNumber"
                  type="text"
                  placeholder="Enter Government ID Number"
                  value={formData.idNumber}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  disabled={isSubmitting}
                  className={touched.idNumber && errors.idNumber ? 'input-error' : ''}
                />
                {touched.idNumber && errors.idNumber ? (
                  <span className="form-error">{errors.idNumber}</span>
                ) : (
                  <span className="form-hint">e.g. 12-digit Aadhaar or 10-char PAN</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section D: Account Information */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="section-badge">D</span>
            <h3>Account Information</h3>
          </div>
          <div className="form-section-body">
            <div className="form-grid form-grid-3">
              <div className="form-group">
                <label htmlFor="accountType">Account Type *</label>
                <select
                  id="accountType"
                  name="accountType"
                  value={formData.accountType}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  disabled={isSubmitting}
                  className={touched.accountType && errors.accountType ? 'input-error' : ''}
                >
                  <option value="SAVINGS">Savings Account</option>
                  <option value="CURRENT">Current Account</option>
                </select>
                {touched.accountType && errors.accountType && (
                  <span className="form-error">{errors.accountType}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="currency">Currency</label>
                <input
                  id="currency"
                  name="currency"
                  type="text"
                  value="INR (₹)"
                  disabled
                  style={{ backgroundColor: '#f8fafc', color: '#475569', fontWeight: 600 }}
                />
                <span className="form-hint">Indian Rupee</span>
              </div>

              <div className="form-group">
                <label htmlFor="initialDeposit">Initial Deposit Amount (₹) *</label>
                <input
                  id="initialDeposit"
                  name="initialDeposit"
                  type="number"
                  min="1"
                  step="100"
                  placeholder="1000"
                  value={formData.initialDeposit}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  disabled={isSubmitting}
                  className={touched.initialDeposit && errors.initialDeposit ? 'input-error' : ''}
                />
                {touched.initialDeposit && errors.initialDeposit ? (
                  <span className="form-error">{errors.initialDeposit}</span>
                ) : (
                  <span className="form-hint">Minimum initial deposit ₹1</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section E: Declaration */}
        <div className="form-section">
          <div className="form-section-header">
            <span className="section-badge">E</span>
            <h3>Declaration</h3>
          </div>
          <div className="form-section-body">
            <div className="declaration-box">
              <label
                className={`checkbox-item ${touched.confirmAccuracy && errors.confirmAccuracy ? 'has-error' : ''}`}
              >
                <input
                  type="checkbox"
                  name="confirmAccuracy"
                  checked={formData.confirmAccuracy}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  disabled={isSubmitting}
                />
                <span className="checkbox-text">
                  I confirm that the information provided is accurate.
                </span>
              </label>
              {touched.confirmAccuracy && errors.confirmAccuracy && (
                <span className="form-error" style={{ marginLeft: '26px' }}>
                  {errors.confirmAccuracy}
                </span>
              )}

              <label
                className={`checkbox-item ${touched.agreeTerms && errors.agreeTerms ? 'has-error' : ''}`}
              >
                <input
                  type="checkbox"
                  name="agreeTerms"
                  checked={formData.agreeTerms}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  disabled={isSubmitting}
                />
                <span className="checkbox-text">
                  I agree to the bank's terms and conditions.
                </span>
              </label>
              {touched.agreeTerms && errors.agreeTerms && (
                <span className="form-error" style={{ marginLeft: '26px' }}>
                  {errors.agreeTerms}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="form-actions-bar">
          <Link to="/accounts" className="btn btn-secondary">
            Cancel
          </Link>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || !isFormValid}
            style={{ minWidth: '280px' }}
          >
            {isSubmitting ? (
              <>
                <span className="spinner-inline" /> Submitting Application...
              </>
            ) : (
              'Submit Account Opening Application'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AccountOpening;

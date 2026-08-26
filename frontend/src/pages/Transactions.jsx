import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { accountService } from '../services/account.service';
import { transactionService } from '../services/transaction.service';
import { formatCurrency, formatDate } from '../utils/formatters';

export function Transactions() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Transfer Form & Account Selection State
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsError, setAccountsError] = useState('');

  const [fromAccount, setFromAccount] = useState('');
  const [sourceBalance, setSourceBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState(false);

  const [toAccount, setToAccount] = useState('');
  const [amount, setAmount] = useState('');

  const [formErrors, setFormErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [lastReceipt, setLastReceipt] = useState(null);

  // Persistent Transaction History & Pagination State
  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [transactionsError, setTransactionsError] = useState('');

  const [pagination, setPagination] = useState({
    page: parseInt(searchParams.get('page'), 10) || 1,
    limit: 10,
    totalCount: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // Filter Form State (synchronized with URL params)
  const [filterInputs, setFilterInputs] = useState({
    search: searchParams.get('search') || '',
    fromDate: searchParams.get('fromDate') || '',
    toDate: searchParams.get('toDate') || '',
    type: searchParams.get('type') || 'ALL',
    status: searchParams.get('status') || 'ALL',
  });

  const [showFilters, setShowFilters] = useState(
    Boolean(
      searchParams.get('search') ||
      searchParams.get('fromDate') ||
      searchParams.get('toDate') ||
      (searchParams.get('type') && searchParams.get('type') !== 'ALL') ||
      (searchParams.get('status') && searchParams.get('status') !== 'ALL')
    )
  );

  // Check if any filter is active
  const isFilterApplied = Boolean(
    filterInputs.search.trim() ||
    filterInputs.fromDate ||
    filterInputs.toDate ||
    filterInputs.type !== 'ALL' ||
    filterInputs.status !== 'ALL'
  );

  // Load derived ledger balance for a specific source account
  const loadSourceBalance = useCallback(async (accountId) => {
    if (!accountId) {
      setSourceBalance(null);
      return;
    }

    setLoadingBalance(true);
    setBalanceError(false);

    try {
      const data = await accountService.getAccountBalance(accountId);
      setSourceBalance(typeof data?.balance === 'number' ? data.balance : 0);
    } catch {
      setBalanceError(true);
      setSourceBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  // Fetch all user accounts
  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setAccountsError('');

    try {
      const data = await accountService.getAccounts();
      const accountList = Array.isArray(data?.accounts) ? data.accounts : [];
      setAccounts(accountList);

      const activeAccounts = accountList.filter((a) => a.status === 'ACTIVE');
      if (activeAccounts.length > 0) {
        setFromAccount((prev) => {
          const currentValid = activeAccounts.some((a) => a._id === prev);
          return currentValid ? prev : activeAccounts[0]._id;
        });
      }
    } catch (err) {
      if (err.response?.data?.message) {
        setAccountsError(err.response.data.message);
      } else if (err.request && !err.response) {
        setAccountsError('Unable to connect to the server. Please check your network connection.');
      } else {
        setAccountsError('Failed to load accounts. Please try again.');
      }
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  // Fetch paginated & filtered transaction history from GET /api/transactions
  const loadTransactions = useCallback(async (pageToLoad = 1, currentFilters = filterInputs) => {
    setLoadingTransactions(true);
    setTransactionsError('');

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
      if (currentFilters.type && currentFilters.type !== 'ALL') {
        params.type = currentFilters.type;
      }
      if (currentFilters.status && currentFilters.status !== 'ALL') {
        params.status = currentFilters.status;
      }

      const data = await transactionService.getTransactions(params);
      const txList = Array.isArray(data?.transactions) ? data.transactions : [];
      setTransactions(txList);

      if (data?.pagination) {
        setPagination({
          page: data.pagination.page || pageToLoad,
          limit: data.pagination.limit || 10,
          totalCount: typeof data.pagination.totalCount === 'number' ? data.pagination.totalCount : txList.length,
          totalPages: data.pagination.totalPages || 1,
          hasNextPage: Boolean(data.pagination.hasNextPage),
          hasPrevPage: Boolean(data.pagination.hasPrevPage),
        });
      }

      // Synchronize active filters and page to URL search params
      const nextParams = new URLSearchParams();
      if (pageToLoad > 1) nextParams.set('page', String(pageToLoad));
      if (params.search) nextParams.set('search', params.search);
      if (params.fromDate) nextParams.set('fromDate', params.fromDate);
      if (params.toDate) nextParams.set('toDate', params.toDate);
      if (params.type) nextParams.set('type', params.type);
      if (params.status) nextParams.set('status', params.status);

      setSearchParams(nextParams, { replace: true });
    } catch (err) {
      if (err.response?.data?.message) {
        setTransactionsError(err.response.data.message);
      } else if (err.request && !err.response) {
        setTransactionsError('Unable to load transaction history. Network connection failed.');
      } else {
        setTransactionsError('Failed to fetch transaction history. Please try again.');
      }
    } finally {
      setLoadingTransactions(false);
    }
  }, [filterInputs, setSearchParams]);

  useEffect(() => {
    loadAccounts();
    const initialPage = parseInt(searchParams.get('page'), 10) || 1;
    loadTransactions(initialPage, filterInputs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When source account changes, fetch its derived balance
  useEffect(() => {
    if (fromAccount) {
      loadSourceBalance(fromAccount);
    }
  }, [fromAccount, loadSourceBalance]);

  // Client-side transfer form validation
  const validateForm = () => {
    const errors = {};
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;

    if (!fromAccount) {
      errors.fromAccount = 'Source account is required';
    }

    const trimmedTo = toAccount.trim();
    if (!trimmedTo) {
      errors.toAccount = 'Destination account ID is required';
    } else if (!objectIdRegex.test(trimmedTo)) {
      errors.toAccount = 'Destination account must be a valid 24-character hexadecimal ID';
    } else if (trimmedTo === fromAccount) {
      errors.toAccount = 'Destination account cannot be the same as the source account';
    }

    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount)) {
      errors.amount = 'Transfer amount is required and must be a valid number';
    } else if (numAmount <= 0) {
      errors.amount = 'Transfer amount must be greater than zero';
    } else if (sourceBalance !== null && numAmount > sourceBalance) {
      errors.amount = `Amount exceeds available balance (${formatCurrency(sourceBalance)})`;
    }

    return errors;
  };

  const handleInputChange = (field, value) => {
    if (field === 'toAccount') {
      setToAccount(value);
    } else if (field === 'amount') {
      setAmount(value);
    } else if (field === 'fromAccount') {
      setFromAccount(value);
    }

    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (apiError) {
      setApiError('');
    }
  };

  // Filter input change handler
  const handleFilterInputChange = (field, value) => {
    setFilterInputs((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Apply filters button clicked or Search form submitted
  const handleApplyFilters = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    loadTransactions(1, filterInputs);
  };

  // Reset all filters to defaults
  const handleResetFilters = () => {
    const defaultFilters = {
      search: '',
      fromDate: '',
      toDate: '',
      type: 'ALL',
      status: 'ALL',
    };
    setFilterInputs(defaultFilters);
    loadTransactions(1, defaultFilters);
  };

  // Clear a single specific filter tag
  const handleClearFilterField = (field) => {
    const updated = {
      ...filterInputs,
      [field]: field === 'type' || field === 'status' ? 'ALL' : '',
    };
    setFilterInputs(updated);
    loadTransactions(1, updated);
  };

  // Page navigation
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages && newPage !== pagination.page) {
      loadTransactions(newPage, filterInputs);
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setApiError('');
    const validationErrors = validateForm();

    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);

    // Generate fresh idempotency key for this submission attempt
    const idempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);

    try {
      const payload = {
        fromAccount,
        toAccount: toAccount.trim(),
        amount: Number(amount),
        idempotencyKey,
      };

      const response = await transactionService.createTransaction(payload);
      const tx = response.transaction;

      if (tx) {
        setLastReceipt(tx);
      }

      // Refresh source account balance to reflect atomic ledger debit
      await loadSourceBalance(fromAccount);

      // Refresh transaction history on page 1
      await loadTransactions(1, filterInputs);

      // Reset form fields
      setToAccount('');
      setAmount('');
      setFormErrors({});
    } catch (err) {
      if (err.response?.data?.message) {
        setApiError(err.response.data.message);
      } else if (err.request && !err.response) {
        setApiError('Unable to reach the server. Please check your network connection and try again.');
      } else {
        setApiError('Transfer failed. Please check your details and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeAccounts = accounts.filter((a) => a.status === 'ACTIVE');
  const otherOwnAccounts = activeAccounts.filter((a) => a._id !== fromAccount);
  const ownAccountIds = useMemo(() => new Set(accounts.map((a) => a._id)), [accounts]);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Transfer Funds</h1>
        <p>Transfer funds securely between accounts with atomic double-entry ledger execution.</p>
      </div>

      {apiError && (
        <div className="alert alert-error" role="alert">
          {apiError}
        </div>
      )}

      {accountsError && (
        <div className="alert alert-error" role="alert">
          <span>{accountsError}</span>
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

      {loadingAccounts ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
            <span className="spinner-inline" style={{ width: '28px', height: '28px' }} />
            <p style={{ marginTop: '1rem', color: '#64748b' }}>Loading account details...</p>
          </div>
        </div>
      ) : activeAccounts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏦</div>
          <h3>No Active Accounts Available</h3>
          <p>
            {accounts.length > 0
              ? 'Your account(s) are currently suspended or inactive. Outgoing transfers cannot be initiated. Please contact customer support.'
              : 'You need at least one active deposit account to transfer funds. Please open an account first.'}
          </p>
          <Link to="/accounts" className="btn btn-primary">
            Go to Accounts
          </Link>
        </div>
      ) : (
        <div className="transfer-layout">
          {/* Transfer Form Card */}
          <div className="card">
            <div className="card-header">
              <h3>New Transfer</h3>
            </div>

            <div className="card-body">
              <form onSubmit={handleTransfer} noValidate>
                {/* Source Account Selector */}
                <div className="form-group">
                  <label htmlFor="fromAccount">Source Account (Debit)</label>
                  <select
                    id="fromAccount"
                    name="fromAccount"
                    value={fromAccount}
                    onChange={(e) => handleInputChange('fromAccount', e.target.value)}
                    disabled={isSubmitting}
                    className={formErrors.fromAccount ? 'input-error' : ''}
                  >
                    {activeAccounts.map((acc) => (
                      <option key={acc._id} value={acc._id}>
                        {acc._id} ({acc.currency || 'INR'} - {acc.status})
                      </option>
                    ))}
                  </select>
                  {formErrors.fromAccount && (
                    <span className="form-error">{formErrors.fromAccount}</span>
                  )}
                </div>

                {/* Available Source Balance Display */}
                <div className="form-group">
                  <div
                    style={{
                      background: '#f8fafc',
                      padding: '0.75rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: 500 }}>
                      Available Ledger Balance:
                    </span>
                    {loadingBalance ? (
                      <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                        <span className="spinner-inline" /> Fetching...
                      </span>
                    ) : balanceError ? (
                      <span style={{ fontSize: '0.8125rem', color: '#dc2626' }}>
                        Unavailable{' '}
                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#0284c7',
                            textDecoration: 'underline',
                          }}
                          onClick={() => loadSourceBalance(fromAccount)}
                        >
                          Retry
                        </button>
                      </span>
                    ) : (
                      <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e3a8a' }}>
                        {formatCurrency(sourceBalance)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Destination Account ID Input */}
                <div className="form-group">
                  <label htmlFor="toAccount">Destination Account ID (Credit)</label>
                  <input
                    id="toAccount"
                    name="toAccount"
                    type="text"
                    placeholder="e.g. 6a8aedd4ab1d773010152dee"
                    value={toAccount}
                    onChange={(e) => handleInputChange('toAccount', e.target.value)}
                    disabled={isSubmitting}
                    className={formErrors.toAccount ? 'input-error' : ''}
                    autoComplete="off"
                  />
                  {formErrors.toAccount && (
                    <span className="form-error">{formErrors.toAccount}</span>
                  )}
                  {otherOwnAccounts.length > 0 && (
                    <div style={{ marginTop: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Or transfer to your other account:{' '}
                      </span>
                      {otherOwnAccounts.map((acc) => (
                        <button
                          key={acc._id}
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#0284c7',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            marginRight: '0.5rem',
                            padding: 0,
                          }}
                          onClick={() => handleInputChange('toAccount', acc._id)}
                        >
                          {acc._id.slice(-6)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Amount Input */}
                <div className="form-group">
                  <label htmlFor="amount">Transfer Amount</label>
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    step="any"
                    min="1"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => handleInputChange('amount', e.target.value)}
                    disabled={isSubmitting}
                    className={formErrors.amount ? 'input-error' : ''}
                  />
                  {formErrors.amount && <span className="form-error">{formErrors.amount}</span>}
                  <span className="form-hint">
                    Transactions are serialized and validated against the immutable ledger.
                  </span>
                </div>

                {/* Submit Action */}
                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={isSubmitting || loadingBalance}
                  style={{ marginTop: '0.5rem' }}
                >
                  {isSubmitting ? (
                    <>
                      <span className="spinner-inline" /> Processing Transfer...
                    </>
                  ) : (
                    'Transfer Funds'
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Receipt & Persistent Transaction History Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Live Transaction Receipt */}
            {lastReceipt && (
              <div className="receipt-card">
                <div className="receipt-header">
                  <span className="receipt-title">✓ Transfer Receipt</span>
                  <span className="badge badge-success">{lastReceipt.status || 'COMPLETED'}</span>
                </div>

                <div className="receipt-details">
                  <div className="receipt-row">
                    <span className="label">Amount:</span>
                    <span className="value amount">{formatCurrency(lastReceipt.amount)}</span>
                  </div>
                  <div className="receipt-row">
                    <span className="label">Transaction ID:</span>
                    <span className="value mono">{lastReceipt._id}</span>
                  </div>
                  <div className="receipt-row">
                    <span className="label">From Account:</span>
                    <span className="value mono">{lastReceipt.fromAccount}</span>
                  </div>
                  <div className="receipt-row">
                    <span className="label">To Account:</span>
                    <span className="value mono">{lastReceipt.toAccount}</span>
                  </div>
                  <div className="receipt-row">
                    <span className="label">Executed At:</span>
                    <span className="value">{formatDate(lastReceipt.createdAt)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Persistent Transaction History Panel with Search, Filters & Pagination */}
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3>Transaction History</h3>
                  {pagination.totalCount > 0 && (
                    <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                      {pagination.totalCount}
                    </span>
                  )}
                </div>

                <div className="tx-history-header-actions">
                  <button
                    type="button"
                    className={`btn btn-sm ${showFilters || isFilterApplied ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setShowFilters((prev) => !prev)}
                    title="Toggle search and filter panel"
                  >
                    🔍 Filters {isFilterApplied && '•'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => loadTransactions(pagination.page, filterInputs)}
                    disabled={loadingTransactions}
                  >
                    {loadingTransactions ? 'Refreshing...' : '↻ Refresh'}
                  </button>
                </div>
              </div>

              <div className="card-body">
                {/* Collapsible Search & Filter Panel */}
                {showFilters && (
                  <form className="tx-filter-panel" onSubmit={handleApplyFilters}>
                    <div className="tx-filter-grid">
                      {/* Search Bar */}
                      <div className="filter-field">
                        <label htmlFor="txSearch">Search</label>
                        <input
                          id="txSearch"
                          type="text"
                          placeholder="Search ID, Account, or Name..."
                          value={filterInputs.search}
                          onChange={(e) => handleFilterInputChange('search', e.target.value)}
                        />
                      </div>

                      {/* Direction / Type Dropdown */}
                      <div className="filter-field">
                        <label htmlFor="txType">Direction</label>
                        <select
                          id="txType"
                          value={filterInputs.type}
                          onChange={(e) => handleFilterInputChange('type', e.target.value)}
                        >
                          <option value="ALL">All Directions</option>
                          <option value="CREDIT">Credits Only (+ Inflow)</option>
                          <option value="DEBIT">Debits Only (- Outflow)</option>
                        </select>
                      </div>

                      {/* Status Dropdown */}
                      <div className="filter-field">
                        <label htmlFor="txStatus">Status</label>
                        <select
                          id="txStatus"
                          value={filterInputs.status}
                          onChange={(e) => handleFilterInputChange('status', e.target.value)}
                        >
                          <option value="ALL">All Statuses</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="PENDING">Pending</option>
                          <option value="FAILED">Failed</option>
                          <option value="REVERSED">Reversed</option>
                        </select>
                      </div>
                    </div>

                    <div className="tx-filter-row-secondary">
                      {/* From Date */}
                      <div className="filter-field">
                        <label htmlFor="txFromDate">From Date</label>
                        <input
                          id="txFromDate"
                          type="date"
                          value={filterInputs.fromDate}
                          onChange={(e) => handleFilterInputChange('fromDate', e.target.value)}
                        />
                      </div>

                      {/* To Date */}
                      <div className="filter-field">
                        <label htmlFor="txToDate">To Date</label>
                        <input
                          id="txToDate"
                          type="date"
                          value={filterInputs.toDate}
                          onChange={(e) => handleFilterInputChange('toDate', e.target.value)}
                        />
                      </div>

                      {/* Filter Action Buttons */}
                      <div className="filter-actions">
                        <button type="submit" className="btn btn-sm btn-primary" disabled={loadingTransactions}>
                          Apply Filters
                        </button>
                        {isFilterApplied && (
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={handleResetFilters}
                            disabled={loadingTransactions}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  </form>
                )}

                {/* Active Filter Badges */}
                {isFilterApplied && (
                  <div className="active-filters-bar">
                    <span>Filtered by:</span>
                    {filterInputs.search && (
                      <span className="filter-tag">
                        Search: "{filterInputs.search}"
                        <button type="button" className="clear-tag-btn" onClick={() => handleClearFilterField('search')}>✕</button>
                      </span>
                    )}
                    {filterInputs.type !== 'ALL' && (
                      <span className="filter-tag">
                        Direction: {filterInputs.type}
                        <button type="button" className="clear-tag-btn" onClick={() => handleClearFilterField('type')}>✕</button>
                      </span>
                    )}
                    {filterInputs.status !== 'ALL' && (
                      <span className="filter-tag">
                        Status: {filterInputs.status}
                        <button type="button" className="clear-tag-btn" onClick={() => handleClearFilterField('status')}>✕</button>
                      </span>
                    )}
                    {filterInputs.fromDate && (
                      <span className="filter-tag">
                        From: {filterInputs.fromDate}
                        <button type="button" className="clear-tag-btn" onClick={() => handleClearFilterField('fromDate')}>✕</button>
                      </span>
                    )}
                    {filterInputs.toDate && (
                      <span className="filter-tag">
                        To: {filterInputs.toDate}
                        <button type="button" className="clear-tag-btn" onClick={() => handleClearFilterField('toDate')}>✕</button>
                      </span>
                    )}
                    <button type="button" className="clear-all-link" onClick={handleResetFilters}>
                      Clear All
                    </button>
                  </div>
                )}

                {transactionsError && (
                  <div className="alert alert-error" style={{ marginBottom: '1rem' }} role="alert">
                    <span>{transactionsError}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      style={{ marginLeft: '0.75rem' }}
                      onClick={() => loadTransactions(pagination.page, filterInputs)}
                    >
                      Retry
                    </button>
                  </div>
                )}

                {loadingTransactions ? (
                  <div style={{ textAlign: 'center', padding: '2.5rem 0', color: '#64748b' }}>
                    <span className="spinner-inline" />
                    <p style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>Loading transaction records...</p>
                  </div>
                ) : transactions.length === 0 ? (
                  isFilterApplied ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
                      <p style={{ fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                        No Transactions Match Your Filters
                      </p>
                      <p style={{ fontSize: '0.8125rem', maxWidth: '340px', margin: '0 auto 1rem' }}>
                        Try adjusting your search keywords, date range, direction, or status.
                      </p>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={handleResetFilters}>
                        Reset Filters
                      </button>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b' }}>
                      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                      <p style={{ fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                        No Transactions Yet
                      </p>
                      <p style={{ fontSize: '0.8125rem' }}>
                        Transfers, incoming funds, and initial allocations will appear here.
                      </p>
                    </div>
                  )
                ) : (
                  <>
                    <div className="activity-list">
                      {transactions.map((item) => {
                        const isOwnSender = ownAccountIds.has(item.fromAccount);
                        const isOwnReceiver = ownAccountIds.has(item.toAccount);
                        const isIncoming = isOwnReceiver && !isOwnSender;

                        const partyLabel = isIncoming ? 'From:' : 'To:';
                        const partyName = isIncoming
                          ? (item.fromAccountHolderName || 'Account Holder')
                          : (item.toAccountHolderName || 'Account Holder');
                        const relatedAccountId = isIncoming ? item.fromAccount : item.toAccount;

                        return (
                          <div key={item._id} className="activity-item">
                            <div className="activity-item-top">
                              <span
                                className={`activity-amount ${
                                  isIncoming ? 'credit' : 'debit'
                                }`}
                              >
                                {isIncoming
                                  ? `+ ${formatCurrency(item.amount)}`
                                  : `- ${formatCurrency(item.amount)}`}
                              </span>
                              <div className="status-group">
                                <span className={`transfer-tag ${isIncoming ? 'tag-credit' : 'tag-debit'}`}>
                                  INTERNAL TRANSFER
                                </span>
                                <span className="badge badge-success">{item.status || 'COMPLETED'}</span>
                              </div>
                            </div>

                            <div className="activity-item-meta">
                              <div className="meta-party-row">
                                <span>
                                  {partyLabel} <strong className="party-name-label">{partyName}</strong>
                                </span>
                              </div>
                              <div className="meta-account-row">
                                <span>
                                  Account: <span className="account-ref">{relatedAccountId}</span>
                                </span>
                              </div>
                              <div className="meta-footer-row">
                                <span className="tx-id">ID: {item._id}</span>
                                <span>{formatDate(item.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Pagination Bar */}
                    {pagination.totalPages > 1 && (
                      <div className="tx-pagination-bar">
                        <div className="pagination-info">
                          Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.totalCount)} of {pagination.totalCount} transactions
                        </div>

                        <div className="pagination-controls">
                          <button
                            type="button"
                            className="page-btn"
                            disabled={!pagination.hasPrevPage || loadingTransactions}
                            onClick={() => handlePageChange(pagination.page - 1)}
                            aria-label="Previous Page"
                          >
                            ‹ Prev
                          </button>

                          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                            .filter((p) => {
                              return (
                                p === 1 ||
                                p === pagination.totalPages ||
                                Math.abs(p - pagination.page) <= 1
                              );
                            })
                            .map((p, idx, filtered) => {
                              const prevP = filtered[idx - 1];
                              const showEllipsis = prevP && p - prevP > 1;

                              return (
                                <React.Fragment key={p}>
                                  {showEllipsis && <span className="page-ellipsis">…</span>}
                                  <button
                                    type="button"
                                    className={`page-btn ${p === pagination.page ? 'active' : ''}`}
                                    onClick={() => handlePageChange(p)}
                                    disabled={loadingTransactions}
                                  >
                                    {p}
                                  </button>
                                </React.Fragment>
                              );
                            })}

                          <button
                            type="button"
                            className="page-btn"
                            disabled={!pagination.hasNextPage || loadingTransactions}
                            onClick={() => handlePageChange(pagination.page + 1)}
                            aria-label="Next Page"
                          >
                            Next ›
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Transactions;

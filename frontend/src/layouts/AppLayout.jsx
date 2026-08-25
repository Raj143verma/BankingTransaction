import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isSystemUser = user?.systemUser === true;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="container header-container">
          <div className="brand">
            <span className="brand-badge">BT</span>
            <span className="brand-name">Banking Transaction</span>
          </div>

          <nav className="nav-menu">
            <NavLink
              to="/dashboard"
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/accounts"
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              Accounts
            </NavLink>
            <NavLink
              to="/transactions"
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              Transactions
            </NavLink>
            {isSystemUser && (
              <>
                <NavLink
                  to="/system/applications"
                  className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
                >
                  Applications
                </NavLink>
                <NavLink
                  to="/system/funds"
                  className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
                >
                  Fund Management
                </NavLink>
              </>
            )}
          </nav>

          <div className="user-profile">
            <div className="user-info">
              <span className="user-name">
                {user?.name || 'Account User'}
                {isSystemUser && (
                  <span className="badge badge-system" style={{ marginLeft: '0.375rem', fontSize: '0.6875rem' }}>
                    SYSTEM
                  </span>
                )}
              </span>
              <span className="user-email">{user?.email || ''}</span>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="app-main container">
        <Outlet />
      </main>

      <footer className="app-footer">
        <div className="container footer-content">
          <p>© {new Date().getFullYear()} Banking Transaction System. Double-Entry Ledger Backend.</p>
        </div>
      </footer>
    </div>
  );
}

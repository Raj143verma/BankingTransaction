import React from 'react';
import { Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="auth-layout">
      <div className="auth-card-container">
        <div className="auth-brand">
          <span className="brand-badge">BT</span>
          <h1 className="brand-title">Banking Transaction</h1>
          <p className="brand-subtitle">Secure, Double-Entry Banking Platform</p>
        </div>
        <div className="auth-card">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

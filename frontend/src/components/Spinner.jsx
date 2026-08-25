import React from 'react';

export function Spinner({ message = 'Loading...' }) {
  return (
    <div className="loading-screen">
      <div className="spinner" />
      {message && <p>{message}</p>}
    </div>
  );
}

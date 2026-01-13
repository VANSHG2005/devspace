import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f', fontFamily: "'Syne', sans-serif", textAlign: 'center' }}>
      <div>
        <div style={{ fontSize: 72, marginBottom: 16 }}>404</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#e2e2f0', marginBottom: 8 }}>Page not found</h2>
        <p style={{ color: '#6e6e8f', marginBottom: 32 }}>The workspace or page you're looking for doesn't exist.</p>
        <Link to="/dashboard" style={{ padding: '12px 28px', borderRadius: 9, background: '#7c6af7', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

import React from 'react'

const variants = {
  primary: { background: '#7c6af7', color: '#fff', border: 'none' },
  ghost:   { background: 'transparent', color: '#e2e2f0', border: '1px solid #1e1e2e' },
  danger:  { background: 'rgba(255,83,112,0.12)', color: '#ff5370', border: '1px solid rgba(255,83,112,0.3)' },
  success: { background: 'rgba(61,255,160,0.1)', color: '#3dffa0', border: '1px solid rgba(61,255,160,0.3)' },
}
const sizes = {
  sm: { padding: '6px 14px', fontSize: 12 },
  md: { padding: '10px 20px', fontSize: 14 },
  lg: { padding: '14px 28px', fontSize: 16 },
}

export default function Button({ children, variant = 'primary', size = 'md', loading, style = {}, ...props }) {
  return (
    <button style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      borderRadius: 8, fontFamily: 'inherit', fontWeight: 600,
      cursor: props.disabled ? 'not-allowed' : 'pointer',
      opacity: props.disabled ? 0.6 : 1,
      transition: 'all 0.18s',
      ...variants[variant], ...sizes[size], ...style,
    }} {...props}>
      {loading && <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />}
      {children}
    </button>
  )
}

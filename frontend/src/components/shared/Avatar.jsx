import React from 'react'

export default function Avatar({ user, size = 32, showStatus = false }) {
  const color = user?.color || '#7c6af7'
  const initials = user?.avatar || (user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?')
  return (
    <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: `linear-gradient(135deg, ${color}80, ${color})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.36, fontWeight: 700, color: '#fff',
        fontFamily: "'JetBrains Mono', monospace",
        border: `2px solid ${color}40`,
        userSelect: 'none', flexShrink: 0,
      }}>
        {initials}
      </div>
      {showStatus && (
        <div style={{
          position: 'absolute', bottom: 1, right: 1,
          width: size * 0.28, height: size * 0.28, borderRadius: '50%',
          background: '#3dffa0', border: '2px solid #0a0a0f',
        }} />
      )}
    </div>
  )
}

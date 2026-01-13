import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'

export default function ProtectedRoute({ children }) {
  const { token, initialized } = useSelector(s => s.auth)
  const location = useLocation()

  // If we have a token but aren't initialized yet (loading user data),
  // show a mini spinner rather than redirect - avoids flash to landing page
  if (token && !initialized) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0a0a0f', flexDirection:'column', gap:16 }}>
        <div style={{ width:40, height:40, borderRadius:10, background:'linear-gradient(135deg,#7c6af7,#ff7eb3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>⌨️</div>
        <div style={{ width:28, height:28, borderRadius:'50%', border:'3px solid #1e1e2e', borderTopColor:'#7c6af7', animation:'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  if (!token) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

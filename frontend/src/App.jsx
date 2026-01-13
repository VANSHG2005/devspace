import React, { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { loadUser } from './store/slices/authSlice'
import LandingPage from './components/Landing/LandingPage'
import LoginPage from './components/Auth/LoginPage'
import SignupPage from './components/Auth/SignupPage'
import Dashboard from './components/Dashboard/Dashboard'
import WorkspacePage from './components/Workspace/WorkspacePage'
import ProfilePage from './components/Profile/ProfilePage'
import ProtectedRoute from './components/shared/ProtectedRoute'

export default function App() {
  const dispatch = useDispatch()
  const { token, initialized } = useSelector(s => s.auth)

  useEffect(() => {
    if (token) dispatch(loadUser())
  }, [])

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes blink { 0%,100% { opacity:1 } 50% { opacity:0 } }
        * { box-sizing: border-box; margin: 0; padding: 0 }
        body { font-family: 'Syne', sans-serif }
        ::-webkit-scrollbar { width: 6px; height: 6px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: #2d2d42; border-radius: 3px }
        ::-webkit-scrollbar-thumb:hover { background: #3d3d55 }
      `}</style>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={
          token && initialized ? <Navigate to="/dashboard" replace /> : <LoginPage />
        } />
        <Route path="/signup" element={
          token && initialized ? <Navigate to="/dashboard" replace /> : <SignupPage />
        } />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/workspace/:id" element={<ProtectedRoute><WorkspacePage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

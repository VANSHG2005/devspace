import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { signup, clearError } from '../../store/slices/authSlice'
import { toast } from 'react-toastify'

const C = { bg:'#0a0a0f', surface:'#111118', border:'#1e1e2e', accent:'#7c6af7', text:'#e2e2f0', muted:'#6e6e8f', red:'#ff5370' }

export default function SignupPage() {
  const [form, setForm] = useState({ name:'', email:'', password:'', confirm:'' })
  const [showPw, setShowPw] = useState(false)
  const [localErr, setLocalErr] = useState('')
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { loading, error } = useSelector(s => s.auth)

  useEffect(() => { return () => dispatch(clearError()) }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirm) { setLocalErr('Passwords do not match'); return }
    if (form.password.length < 6) { setLocalErr('Password must be at least 6 characters'); return }
    setLocalErr('')
    const res = await dispatch(signup({ name:form.name, email:form.email, password:form.password }))
    if (res.meta.requestStatus === 'fulfilled') { toast.success('Account created! Welcome 🚀'); navigate('/dashboard') }
  }

  const inp = (extra={}) => ({ width:'100%', padding:'11px 14px', background:'#0d0d14', border:`1px solid ${C.border}`, borderRadius:9, color:C.text, fontSize:14, fontFamily:'inherit', outline:'none', boxSizing:'border-box', transition:'border-color .15s', ...extra })
  const displayErr = localErr || error

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:C.bg, backgroundImage:`linear-gradient(${C.border}50 1px,transparent 1px),linear-gradient(90deg,${C.border}50 1px,transparent 1px)`, backgroundSize:'40px 40px' }}>
      <div style={{ position:'fixed', top:'20%', left:'50%', transform:'translateX(-50%)', width:600, height:400, background:`radial-gradient(ellipse,${C.accent}12,transparent 70%)`, pointerEvents:'none' }} />

      <div style={{ width:'100%', maxWidth:440, padding:'0 24px', position:'relative', zIndex:1, marginTop:24 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:52,height:52,borderRadius:14,background:`linear-gradient(135deg,${C.accent},#ff7eb3)`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',fontSize:24,boxShadow:`0 8px 32px ${C.accent}40` }}>⌨️</div>
          <h1 style={{ fontSize:28,fontWeight:800,letterSpacing:'-1px',marginBottom:6 }}>Create account</h1>
          <p style={{ color:C.muted, fontSize:14 }}>Start collaborating in minutes</p>
        </div>

        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:32, boxShadow:'0 24px 64px rgba(0,0,0,0.5)' }}>
          {displayErr && (
            <div style={{ padding:'10px 14px',background:`${C.red}12`,border:`1px solid ${C.red}35`,borderRadius:8,color:C.red,fontSize:13,marginBottom:20 }}>
              ⚠️ {displayErr}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block',fontSize:11,fontWeight:700,color:C.muted,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.6px' }}>Full Name</label>
              <input type="text" required autoComplete="name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Vansh Garg"
                style={inp()} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block',fontSize:11,fontWeight:700,color:C.muted,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.6px' }}>Email</label>
              <input type="email" required autoComplete="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@company.com"
                style={inp()} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block',fontSize:11,fontWeight:700,color:C.muted,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.6px' }}>Password</label>
              <div style={{ position:'relative' }}>
                <input type={showPw?'text':'password'} required autoComplete="new-password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Min 6 characters"
                  style={inp({paddingRight:44})} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
                <button type="button" onClick={()=>setShowPw(v=>!v)} style={{ position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:14 }}>
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <div style={{ marginBottom:24 }}>
              <label style={{ display:'block',fontSize:11,fontWeight:700,color:C.muted,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.6px' }}>Confirm Password</label>
              <input type={showPw?'text':'password'} required autoComplete="new-password" value={form.confirm} onChange={e=>setForm({...form,confirm:e.target.value})} placeholder="Repeat password"
                style={inp()} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
            </div>
            <button type="submit" disabled={loading} style={{ width:'100%',padding:'12px',borderRadius:9,background:loading?`${C.accent}80`:C.accent,border:'none',color:'#fff',fontSize:14,fontWeight:700,cursor:loading?'not-allowed':'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:8,boxShadow:`0 4px 16px ${C.accent}40`,transition:'all .15s' }}>
              {loading ? <><div style={{width:16,height:16,borderRadius:'50%',border:'2px solid #fff4',borderTopColor:'#fff',animation:'spin .7s linear infinite'}}/>Creating account...</> : 'Create Account →'}
            </button>
          </form>

          <p style={{ textAlign:'center',marginTop:20,fontSize:13,color:C.muted }}>
            Already have an account?{' '}<Link to="/login" style={{color:C.accent,fontWeight:600,textDecoration:'none'}}>Sign in →</Link>
          </p>
        </div>
        <Link to="/" style={{ display:'block',textAlign:'center',marginTop:16,color:C.muted,fontSize:13,textDecoration:'none' }}>← Back to home</Link>
      </div>
    </div>
  )
}

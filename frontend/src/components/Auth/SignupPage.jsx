import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { signup, clearError } from '../../store/slices/authSlice'
import { toast } from 'react-toastify'
import api from '../../utils/api'

const C = { bg:'#0a0a0f', surface:'#111118', border:'#1e1e2e', accent:'#7c6af7', text:'#e2e2f0', muted:'#6e6e8f', red:'#ff5370', green:'#3dffa0' }

export default function SignupPage() {
  const [step, setStep] = useState('form')   // 'form' | 'otp'
  const [form, setForm] = useState({ name:'', email:'', password:'', confirm:'' })
  const [otp, setOtp] = useState(['','','','','',''])
  const [showPw, setShowPw] = useState(false)
  const [localErr, setLocalErr] = useState('')
  const [requestLoading, setRequestLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const otpRefs = useRef([])

  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { loading, error } = useSelector(s => s.auth)

  useEffect(() => { return () => dispatch(clearError()) }, [])

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const inp = (extra={}) => ({ width:'100%', padding:'11px 14px', background:'#0d0d14', border:`1px solid ${C.border}`, borderRadius:9, color:C.text, fontSize:14, fontFamily:'inherit', outline:'none', boxSizing:'border-box', transition:'border-color .15s', ...extra })

  // Step 1: Request OTP
  const handleRequestOTP = async (e) => {
    e.preventDefault()
    setLocalErr('')
    if (form.password !== form.confirm) { setLocalErr('Passwords do not match'); return }
    if (form.password.length < 6) { setLocalErr('Password must be at least 6 characters'); return }

    setRequestLoading(true)
    try {
      await api.post('/auth/signup/request', {
        name: form.name, email: form.email, password: form.password
      })
      toast.success(`Verification code sent to ${form.email}`)
      setStep('otp')
      setCountdown(60)
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    } catch (err) {
      setLocalErr(err.response?.data?.error || 'Failed to send verification code')
    }
    setRequestLoading(false)
  }

  // Step 2: Verify OTP + create account
  const handleVerifyOTP = async () => {
    const otpValue = otp.join('')
    if (otpValue.length < 6) { setLocalErr('Enter the 6-digit code'); return }
    setLocalErr('')

    const res = await dispatch(signup({
      name: form.name, email: form.email,
      password: form.password, otp: otpValue
    }))
    if (res.meta.requestStatus === 'fulfilled') {
      toast.success('Account verified! Welcome to DevSpace 🚀')
      navigate('/dashboard')
    }
  }

  const handleOtpInput = (i, val) => {
    if (!/^\d*$/.test(val)) return
    const next = [...otp]
    next[i] = val.slice(-1)
    setOtp(next)
    if (val && i < 5) otpRefs.current[i + 1]?.focus()
    if (next.every(d => d !== '')) {
      // Auto-submit when all 6 digits entered
      setTimeout(() => handleVerifyOTP(), 100)
    }
  }

  const handleOtpKey = (i, e) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i-1]?.focus()
    if (e.key === 'Enter') handleVerifyOTP()
  }

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6)
    if (text.length === 6) {
      setOtp(text.split(''))
      otpRefs.current[5]?.focus()
    }
  }

  const displayErr = localErr || error

  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'fixed', top:'20%', left:'50%', transform:'translateX(-50%)', width:500, height:350, background:`radial-gradient(ellipse,${C.accent}15,transparent 70%)`, pointerEvents:'none' }} />
      <div style={{ width:'100%', maxWidth:440, padding:'0 16px', position:'relative', zIndex:1, boxSizing:'border-box' }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ width:48,height:48,borderRadius:12,background:`linear-gradient(135deg,${C.accent},#ff7eb3)`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px',fontSize:22,boxShadow:`0 8px 32px ${C.accent}40` }}>⌨️</div>
          <h1 style={{ fontSize:22,fontWeight:800,color:C.text,marginBottom:4 }}>
            {step === 'form' ? 'Create your account' : 'Verify your email'}
          </h1>
          <p style={{ color:C.muted, fontSize:13 }}>
            {step === 'form' ? 'Join thousands of developers on DevSpace' : `We sent a 6-digit code to ${form.email}`}
          </p>
        </div>

        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:'clamp(20px, 5vw, 32px)', boxShadow:'0 24px 64px rgba(0,0,0,0.5)' }}>
          {displayErr && (
            <div style={{ padding:'10px 14px',background:`${C.red}12`,border:`1px solid ${C.red}35`,borderRadius:8,color:C.red,fontSize:13,marginBottom:20,display:'flex',alignItems:'center',gap:8 }}>
              ⚠ {displayErr}
            </div>
          )}

          {step === 'form' ? (
            <form onSubmit={handleRequestOTP} style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ display:'block',fontSize:11,fontWeight:700,color:C.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.5px' }}>Full Name</label>
                <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Vansh Garg"
                  required style={inp()} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
              </div>
              <div>
                <label style={{ display:'block',fontSize:11,fontWeight:700,color:C.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.5px' }}>Email</label>
                <input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@example.com"
                  required style={inp()} onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
              </div>
              <div>
                <label style={{ display:'block',fontSize:11,fontWeight:700,color:C.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.5px' }}>Password</label>
                <div style={{ position:'relative' }}>
                  <input type={showPw?'text':'password'} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}
                    placeholder="Min. 6 characters" required style={inp({paddingRight:44})}
                    onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
                  <button type="button" onClick={()=>setShowPw(v=>!v)} style={{ position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:14 }}>
                    {showPw ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <div>
                <label style={{ display:'block',fontSize:11,fontWeight:700,color:C.muted,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.5px' }}>Confirm Password</label>
                <input type={showPw?'text':'password'} value={form.confirm} onChange={e=>setForm({...form,confirm:e.target.value})}
                  placeholder="Re-enter password" required style={inp()}
                  onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
              </div>
              <button type="submit" disabled={requestLoading} style={{ width:'100%',padding:'12px',borderRadius:9,background:requestLoading?`${C.accent}80`:C.accent,border:'none',color:'#fff',fontSize:14,fontWeight:700,cursor:requestLoading?'not-allowed':'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:8,boxShadow:`0 4px 16px ${C.accent}40`,marginTop:4 }}>
                {requestLoading ? <><div style={{width:16,height:16,borderRadius:'50%',border:'2px solid #fff4',borderTopColor:'#fff',animation:'spin .7s linear infinite'}}/>Sending code...</> : 'Send verification code →'}
              </button>
            </form>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
              <div>
                <label style={{ display:'block',fontSize:11,fontWeight:700,color:C.muted,marginBottom:12,textTransform:'uppercase',letterSpacing:'0.5px',textAlign:'center' }}>Enter 6-digit code</label>
                {/* OTP digit inputs */}
                <div style={{ display:'flex', gap:8, justifyContent:'center' }} onPaste={handlePaste}>
                  {otp.map((d, i) => (
                    <input key={i} ref={el => otpRefs.current[i] = el}
                      value={d} onChange={e => handleOtpInput(i, e.target.value)}
                      onKeyDown={e => handleOtpKey(i, e)}
                      maxLength={1} inputMode="numeric"
                      style={{ width:44,height:52,textAlign:'center',background:'#0d0d14',border:`1px solid ${d?C.accent:C.border}`,borderRadius:10,color:C.text,fontSize:22,fontWeight:800,fontFamily:'monospace',outline:'none',transition:'border-color .15s',boxSizing:'border-box' }} />
                  ))}
                </div>
                <p style={{ textAlign:'center',color:C.muted,fontSize:12,marginTop:12 }}>
                  {countdown > 0
                    ? `Resend available in ${countdown}s`
                    : <button onClick={()=>{ setOtp(['','','','','','']); setCountdown(0); setStep('form') }} style={{ background:'none',border:'none',color:C.accent,cursor:'pointer',fontSize:12,fontFamily:'inherit',textDecoration:'underline' }}>Resend code</button>
                  }
                </p>
              </div>
              <button onClick={handleVerifyOTP} disabled={loading || otp.join('').length < 6}
                style={{ width:'100%',padding:'12px',borderRadius:9,background:loading||otp.join('').length<6?`${C.accent}50`:C.accent,border:'none',color:'#fff',fontSize:14,fontWeight:700,cursor:loading?'not-allowed':'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:8,boxShadow:`0 4px 16px ${C.accent}40` }}>
                {loading ? <><div style={{width:16,height:16,borderRadius:'50%',border:'2px solid #fff4',borderTopColor:'#fff',animation:'spin .7s linear infinite'}}/>Verifying...</> : '✓ Verify & Create Account'}
              </button>
              <button onClick={()=>{setStep('form');setOtp(['','','','','','']);setLocalErr('')}} style={{ background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:13,fontFamily:'inherit',textAlign:'center' }}>
                ← Change email
              </button>
            </div>
          )}

          <div style={{ marginTop:20, textAlign:'center', color:C.muted, fontSize:13 }}>
            Already have an account? <Link to="/login" style={{ color:C.accent, textDecoration:'none', fontWeight:600 }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

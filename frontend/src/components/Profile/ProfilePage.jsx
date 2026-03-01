import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { updateProfile, logout } from '../../store/slices/authSlice'
import { toast } from 'react-toastify'

const C = { bg:'#0a0a0f', surface:'#111118', alt:'#16161f', border:'#1e1e2e', accent:'#7c6af7', green:'#3dffa0', red:'#ff5370', text:'#e2e2f0', muted:'#6e6e8f', dim:'#3a3a55' }
const COLORS = ['#7c6af7','#3dffa0','#ff5370','#ffca28','#82aaff','#89ddff','#ff9f43','#ff7eb3','#c3e88d','#f78c6c']

export default function ProfilePage() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { user } = useSelector(s => s.auth)
  const [form, setForm] = useState({ name:'', phone:'', bio:'', address:'', color:'#7c6af7', avatar_url:'' })
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (user) {
      setForm({ name: user.name||'', phone: user.phone||'', bio: user.bio||'', address: user.address||'', color: user.color||'#7c6af7', avatar_url: user.avatar_url||'' })
      setPreview(user.avatar_url||null)
    }
  }, [user])

  const handleImg = (e) => {
    const file = e.target.files[0]; if(!file) return
    if(file.size > 2*1024*1024){ toast.error('Image must be under 2MB'); return }
    const r = new FileReader()
    r.onload = ev => { setPreview(ev.target.result); setForm(f=>({...f,avatar_url:ev.target.result})) }
    r.readAsDataURL(file)
  }

  const handleSave = async () => {
    if(!form.name.trim()){ toast.error('Name is required'); return }
    setSaving(true)
    const res = await dispatch(updateProfile(form))
    setSaving(false)
    if(res.meta.requestStatus === 'fulfilled') toast.success('Profile updated!')
    else toast.error(res.payload || 'Update failed')
  }

  const inp = { width:'100%', padding:'10px 14px', background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:14, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }
  const initials = (form.name||user?.name||'U').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.text, fontFamily:"'Syne',sans-serif" }}>
      <div style={{ height:56, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', padding:'0 28px', gap:12, background:C.surface, position:'sticky', top:0, zIndex:50 }}>
        <button onClick={()=>navigate(-1)} style={{ background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:18,padding:'4px 8px',borderRadius:6 }}>←</button>
        <div style={{ width:26,height:26,borderRadius:7,background:'linear-gradient(135deg,#7c6af7,#ff7eb3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13 }}>⌨️</div>
        <span style={{ fontWeight:800, fontSize:15 }}>DevSpace</span>
        <span style={{ color:C.dim, fontSize:13 }}>/</span>
        <span style={{ fontSize:13, color:C.muted }}>Profile Settings</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button onClick={()=>navigate('/dashboard')} style={{ padding:'7px 14px',borderRadius:7,background:'transparent',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:600 }}>Dashboard</button>
          <button onClick={()=>{dispatch(logout());navigate('/')}} style={{ padding:'7px 14px',borderRadius:7,background:'transparent',border:'1px solid rgba(255,83,112,0.3)',color:C.red,cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:600 }}>Sign Out</button>
        </div>
      </div>

      <div style={{ maxWidth:720, margin:'0 auto', padding:'40px 24px' }}>
        {/* Hero card */}
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:28,marginBottom:20,display:'flex',gap:24,alignItems:'center' }}>
          <div style={{ position:'relative', flexShrink:0 }}>
            <div onClick={()=>fileRef.current?.click()} style={{ width:88,height:88,borderRadius:'50%',background:`linear-gradient(135deg,${form.color}80,${form.color})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,fontWeight:800,color:'#fff',overflow:'hidden',border:`3px solid ${form.color}40`,cursor:'pointer' }}>
              {preview ? <img src={preview} alt="av" style={{width:'100%',height:'100%',objectFit:'cover'}} /> : initials}
            </div>
            <div onClick={()=>fileRef.current?.click()} style={{ position:'absolute',bottom:0,right:0,width:26,height:26,borderRadius:'50%',background:C.accent,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',border:`2px solid ${C.bg}`,fontSize:12 }}>📷</div>
            <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleImg} />
          </div>
          <div style={{flex:1}}>
            <h2 style={{ fontSize:20,fontWeight:800,letterSpacing:'-0.5px',marginBottom:3 }}>{user?.name}</h2>
            <p style={{ color:C.muted, fontSize:13, marginBottom:10 }}>{user?.email}</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <span style={{ fontSize:11,padding:'3px 8px',borderRadius:4,background:`${C.accent}15`,color:C.accent,border:`1px solid ${C.accent}25`,fontWeight:700 }}>'✉️ Email'</span>
              <span style={{ fontSize:11,padding:'3px 8px',borderRadius:4,background:`${C.green}10`,color:C.green,border:`1px solid ${C.green}20`,fontWeight:700 }}>Active</span>
              {user?.created_at && <span style={{ fontSize:11,padding:'3px 8px',borderRadius:4,background:C.alt,color:C.muted,border:`1px solid ${C.border}` }}>Joined {new Date(user.created_at).toLocaleDateString('en',{month:'short',year:'numeric'})}</span>}
            </div>
          </div>
        </div>

        <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
          {/* Identity */}
          <Sec title="Identity" icon="👤">
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14 }}>
              <Fld label="Full Name" required>
                <input style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Your full name"
                  onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
              </Fld>
              <Fld label="Phone Number">
                <input style={inp} value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="+91 98765 43210" type="tel"
                  onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
              </Fld>
            </div>
            <Fld label="Email" hint="Read only">
              <input style={{...inp,opacity:0.5,cursor:'not-allowed'}} value={user?.email||''} disabled />
            </Fld>
          </Sec>

          {/* About */}
          <Sec title="About" icon="✏️">
            <Fld label="Bio">
              <textarea style={{...inp,minHeight:80,resize:'vertical',lineHeight:1.6}} value={form.bio} onChange={e=>setForm(f=>({...f,bio:e.target.value}))} placeholder="Tell your collaborators about yourself..."
                onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
            </Fld>
            <Fld label="Address">
              <input style={inp} value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} placeholder="City, Country"
                onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
            </Fld>
          </Sec>

          {/* Avatar URL */}
          <Sec title="Profile Photo URL" icon="🖼️" hint="or upload above">
            <Fld label="Avatar URL">
              <div style={{display:'flex',gap:10}}>
                <input style={{...inp,flex:1}} value={form.avatar_url} onChange={e=>{setForm(f=>({...f,avatar_url:e.target.value}));setPreview(e.target.value||null)}} placeholder="https://example.com/photo.jpg"
                  onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
                {form.avatar_url && <button onClick={()=>{setForm(f=>({...f,avatar_url:''}));setPreview(null)}} style={{ padding:'8px 12px',borderRadius:7,background:'rgba(255,83,112,0.1)',border:'1px solid rgba(255,83,112,0.3)',color:C.red,cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600 }}>✕</button>}
              </div>
            </Fld>
          </Sec>

          {/* Cursor color */}
          <Sec title="Cursor Color" icon="🎨" hint="Your cursor color in workspace">
            <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
              {COLORS.map(c=>(
                <button key={c} onClick={()=>setForm(f=>({...f,color:c}))}
                  style={{ width:34,height:34,borderRadius:'50%',background:c,border:form.color===c?'3px solid #fff':'3px solid transparent',cursor:'pointer',transition:'transform .15s',transform:form.color===c?'scale(1.25)':'scale(1)',boxShadow:form.color===c?`0 0 10px ${c}80`:'none' }} />
              ))}
              <span style={{ fontSize:12,color:C.muted,fontFamily:'monospace',marginLeft:4 }}>{form.color}</span>
            </div>
          </Sec>

          {/* Actions */}
          <div style={{ display:'flex',gap:10,justifyContent:'flex-end',paddingTop:4 }}>
            <button onClick={()=>navigate(-1)} style={{ padding:'10px 22px',borderRadius:8,background:'transparent',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',fontSize:13,fontFamily:'inherit',fontWeight:600 }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding:'10px 28px',borderRadius:8,background:C.accent,border:'none',color:'#fff',cursor:saving?'not-allowed':'pointer',fontSize:13,fontFamily:'inherit',fontWeight:700,opacity:saving?0.7:1,display:'flex',alignItems:'center',gap:7,boxShadow:`0 4px 16px ${C.accent}30` }}>
              {saving && <div style={{width:13,height:13,borderRadius:'50%',border:'2px solid #fff5',borderTopColor:'#fff',animation:'spin .7s linear infinite'}} />}
              {saving ? 'Saving...' : '✓ Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Sec({title,icon,hint,children}){
  return (
    <div style={{background:'#111118',border:'1px solid #1e1e2e',borderRadius:12,padding:22}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
        <span>{icon}</span><span style={{fontSize:14,fontWeight:700}}>{title}</span>
        {hint && <span style={{fontSize:11,color:'#6e6e8f',marginLeft:2}}>— {hint}</span>}
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>{children}</div>
    </div>
  )
}
function Fld({label,required,hint,children}){
  return (
    <div>
      <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:700,color:'#6e6e8f',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.5px'}}>
        {label}{required && <span style={{color:'#ff5370'}}>*</span>}
        {hint && <span style={{fontWeight:400,textTransform:'none',letterSpacing:0,color:'#3a3a55'}}>({hint})</span>}
      </label>
      {children}
    </div>
  )
}

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { logout } from '../../store/slices/authSlice'
import { fetchWorkspaces, createWorkspace, deleteWorkspace } from '../../store/slices/workspaceSlice'
import { toast } from 'react-toastify'
import api from '../../utils/api'

const C = {
  bg:'#0a0a0f', surface:'#111118', alt:'#16161f', border:'#1e1e2e',
  borderHover:'#2d2d42', accent:'#7c6af7', green:'#3dffa0', red:'#ff5370',
  yellow:'#ffca28', blue:'#82aaff', text:'#e2e2f0', muted:'#6e6e8f', dim:'#3a3a55'
}
const LANG_COLORS = { javascript:C.yellow, typescript:C.blue, python:C.green, rust:'#ff9f43', go:'#89ddff', default:C.accent }
const LANG_ICONS  = { python:'🐍', typescript:'📘', rust:'🦀', go:'🐹', javascript:'📄', default:'📁' }

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB'
  return (bytes/1024/1024).toFixed(2) + ' MB'
}
function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })
}

// ── Share Modal ───────────────────────────────────────────────────────────────
function ShareModal({ ws, onClose }) {
  const link = `${window.location.origin}/workspace/${ws.id}`
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(link)
    setCopied(true); toast.success('Link copied!'); setTimeout(() => setCopied(false), 2500)
  }

  const shareOptions = [
    {
      label: 'WhatsApp', color: '#25D366', bg: 'rgba(37,211,102,0.1)',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.999 2C6.477 2 2 6.477 2 12c0 1.89.525 3.658 1.438 5.168L2 22l4.99-1.418A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>,
      action: () => window.open(`https://wa.me/?text=${encodeURIComponent(`Join my DevSpace workspace "${ws.name}":
${link}`)}`, '_blank'),
    },
    {
      label: 'Email', color: '#82aaff', bg: 'rgba(130,170,255,0.1)',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#82aaff" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
      action: () => window.open(`mailto:?subject=${encodeURIComponent(`Join "${ws.name}" on DevSpace`)}&body=${encodeURIComponent(`Hey! I'd like to collaborate with you on DevSpace.

Workspace: ${ws.name}
Join here: ${link}`)}`, '_blank'),
    },
    {
      label: 'Telegram', color: '#29b6f6', bg: 'rgba(41,182,246,0.1)',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="#29b6f6"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>,
      action: () => window.open(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`Join "${ws.name}" on DevSpace`)}`, '_blank'),
    },
    {
      label: 'Twitter / X', color: '#e2e2f0', bg: 'rgba(226,226,240,0.08)',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="#e2e2f0"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
      action: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Collaborating on "${ws.name}" using DevSpace - real-time code editor!`)}&url=${encodeURIComponent(link)}`, '_blank'),
    },
  ]

  // Use native share sheet if available (mobile / some browsers)
  const nativeShare = () => {
    if (navigator.share) {
      navigator.share({ title: `DevSpace — ${ws.name}`, text: `Join my workspace "${ws.name}" on DevSpace`, url: link })
        .then(onClose).catch(() => {})
    }
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center' }} onClick={onClose}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:28,width:420,boxShadow:'0 24px 80px rgba(0,0,0,0.7)' }} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:22 }}>
          <div>
            <h3 style={{ fontSize:17,fontWeight:800,marginBottom:3 }}>📤 Share Workspace</h3>
            <p style={{ fontSize:12,color:C.muted }}>{ws.name}</p>
          </div>
          <button onClick={onClose} style={{ background:`${C.border}80`,border:'none',color:C.muted,cursor:'pointer',width:30,height:30,borderRadius:7,fontSize:15,display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
        </div>

        {/* Link copy bar */}
        <div style={{ display:'flex',gap:8,marginBottom:22,padding:'10px 14px',background:C.alt,borderRadius:10,border:`1px solid ${C.border}` }}>
          <span style={{ flex:1,fontSize:11,color:C.muted,fontFamily:'monospace',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',alignSelf:'center' }}>{link}</span>
          <button onClick={copy} style={{ padding:'6px 14px',borderRadius:7,background:copied?`${C.green}15`:C.accent,border:'none',color:copied?C.green:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit',flexShrink:0,transition:'all .2s' }}>
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
        </div>

        {/* Share options grid */}
        <p style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:12 }}>Share via</p>
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom: navigator.share ? 16 : 0 }}>
          {shareOptions.map(opt => (
            <button key={opt.label} onClick={opt.action}
              style={{ display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderRadius:10,background:opt.bg,border:`1px solid ${opt.color}30`,cursor:'pointer',fontFamily:'inherit',transition:'all .15s' }}
              onMouseEnter={e=>{e.currentTarget.style.background=opt.bg.replace('0.1','0.18');e.currentTarget.style.borderColor=opt.color+'60'}}
              onMouseLeave={e=>{e.currentTarget.style.background=opt.bg;e.currentTarget.style.borderColor=opt.color+'30'}}>
              {opt.icon}
              <span style={{ fontSize:13,fontWeight:600,color:C.text }}>{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Native share button (shows on mobile/supported browsers) */}
        {typeof navigator !== 'undefined' && navigator.share && (
          <button onClick={nativeShare} style={{ width:'100%',marginTop:10,padding:'11px',borderRadius:9,background:`${C.accent}15`,border:`1px solid ${C.accent}35`,color:C.accent,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:8 }}>
            📱 Share via Device
          </button>
        )}
      </div>
    </div>
  )
}

// ── Workspace 3-dot context menu ──────────────────────────────────────────────
function WsMenu({ ws, onClose, onRename, onDelete, onInfo, onShare }) {
  const menuRef = useRef(null)
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) onClose() }
    setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const copyLink = (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(`${window.location.origin}/workspace/${ws.id}`)
    setCopied(true); toast.success('Link copied!'); setTimeout(() => setCopied(false), 2000)
  }

  const items = [
    { icon:'🚀', label:'Open', action: (e) => { e.stopPropagation(); navigate(`/workspace/${ws.id}`); onClose() } },
    { icon:'✏️', label:'Rename', action: (e) => { e.stopPropagation(); onRename(ws); onClose() } },
    { divider: true },
    { icon: copied ? '✓' : '🔗', label: copied ? 'Copied!' : 'Copy Link', action: copyLink },
    { icon:'📤', label:'Share', action: (e) => { e.stopPropagation(); onShare(ws); onClose() } },
    { divider: true },
    { icon:'ℹ️', label:'Info', action: (e) => { e.stopPropagation(); onInfo(ws); onClose() } },
    { divider: true },
    { icon:'🗑️', label:'Delete', danger: true, action: (e) => { e.stopPropagation(); onDelete(ws.id); onClose() } },
  ]

  return (
    <div ref={menuRef} style={{ position:'absolute', top:36, right:4, background:C.surface, border:`1px solid ${C.borderHover}`, borderRadius:10, padding:'5px', minWidth:168, zIndex:300, boxShadow:'0 16px 48px rgba(0,0,0,0.7)', backdropFilter:'blur(8px)' }} onClick={e=>e.stopPropagation()}>
      {items.map((item, i) =>
        item.divider
          ? <div key={i} style={{ height:1, background:C.border, margin:'4px 0' }} />
          : <button key={i} onClick={item.action}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:9, padding:'8px 10px', background:'none', border:'none', color: item.danger ? C.red : C.text, cursor:'pointer', borderRadius:7, fontSize:13, fontFamily:'inherit', textAlign:'left', transition:'background .1s' }}
              onMouseEnter={e=>e.currentTarget.style.background=item.danger?'rgba(255,83,112,0.08)':C.alt}
              onMouseLeave={e=>e.currentTarget.style.background='none'}>
              <span style={{ fontSize:14, width:18, textAlign:'center' }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
      )}
    </div>
  )
}

// ── Workspace Info Modal ───────────────────────────────────────────────────────
function WsInfoModal({ ws, onClose }) {
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/workspaces/${ws.id}/info`).then(r => { setInfo(r.data.info); setLoading(false) }).catch(() => setLoading(false))
  }, [ws.id])

  const row = (label, value, mono=false) => (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'9px 0', borderBottom:`1px solid ${C.border}` }}>
      <span style={{ fontSize:12, color:C.muted, fontWeight:600 }}>{label}</span>
      <span style={{ fontSize:12, color:C.text, fontFamily: mono?'monospace':'inherit', textAlign:'right', maxWidth:'55%', wordBreak:'break-word' }}>{value || '—'}</span>
    </div>
  )

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:0, width:440, maxHeight:'80vh', overflow:'hidden', boxShadow:'0 24px 80px rgba(0,0,0,0.7)' }} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', background:`linear-gradient(135deg,${C.accent}10,transparent)` }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:`${LANG_COLORS[ws.language]||C.accent}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{LANG_ICONS[ws.language]||LANG_ICONS.default}</div>
            <div>
              <h3 style={{ fontSize:16, fontWeight:700 }}>{ws.name}</h3>
              <span style={{ fontSize:11, color:C.muted, fontFamily:'monospace' }}>/{ws.id}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background:`${C.border}80`, border:'none', color:C.muted, cursor:'pointer', width:28, height:28, borderRadius:6, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        <div style={{ padding:'4px 24px 24px', overflowY:'auto', maxHeight:'60vh' }}>
          {loading ? (
            <div style={{ textAlign:'center', padding:'40px 0', color:C.muted }}>
              <div style={{ width:24, height:24, borderRadius:'50%', border:`2px solid ${C.border}`, borderTopColor:C.accent, animation:'spin .7s linear infinite', margin:'0 auto 12px' }} />
              Loading info...
            </div>
          ) : info ? (
            <>
              {row('Language', info.language?.toUpperCase())}
              {row('Owner', info.owner)}
              {row('Owner Email', info.owner_email)}
              {row('Created', formatDate(info.created_at))}
              {row('Last Updated', formatDate(info.updated_at))}
              {row('Files', `${info.file_count} file${info.file_count !== 1 ? 's' : ''}`)}
              {row('Total Size', formatSize(info.total_size))}
              {row('Members', `${info.member_count} member${info.member_count !== 1 ? 's' : ''}`)}
              {info.members?.length > 0 && (
                <div style={{ padding:'9px 0', borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:12, color:C.muted, fontWeight:600, marginBottom:8 }}>Members</div>
                  {info.members.map((m, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                      <span style={{ fontSize:12, color:C.text }}>{m.name}</span>
                      <span style={{ fontSize:10, padding:'2px 7px', borderRadius:4, background:`${C.accent}15`, color:C.accent, border:`1px solid ${C.accent}25`, fontWeight:700 }}>{m.role?.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              )}
              {row('Workspace ID', ws.id, true)}
            </>
          ) : <p style={{ color:C.muted, textAlign:'center', padding:'20px 0' }}>Could not load info</p>}
        </div>
      </div>
    </div>
  )
}

// ── Rename Modal ───────────────────────────────────────────────────────────────
function RenameModal({ ws, onClose, onRenamed }) {
  const [name, setName] = useState(ws.name)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || name.trim() === ws.name) { onClose(); return }
    setSaving(true)
    try {
      await api.patch(`/workspaces/${ws.id}/rename`, { name: name.trim() })
      toast.success('Workspace renamed!')
      onRenamed(ws.id, name.trim())
      onClose()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to rename') }
    setSaving(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:28, width:380 }} onClick={e=>e.stopPropagation()}>
        <h3 style={{ fontSize:16, fontWeight:700, marginBottom:20 }}>✏️ Rename Workspace</h3>
        <input autoFocus value={name} onChange={e=>setName(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter') handleSave(); if (e.key==='Escape') onClose() }}
          style={{ width:'100%', padding:'11px 14px', background:'#0d0d14', border:`1px solid ${C.accent}`, borderRadius:9, color:C.text, fontSize:14, fontFamily:'inherit', outline:'none', marginBottom:20 }} />
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={handleSave} disabled={saving||!name.trim()} style={{ flex:1, padding:'10px', borderRadius:8, background:C.accent, border:'none', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:saving?0.7:1 }}>{saving?'Saving...':'Save'}</button>
          <button onClick={onClose} style={{ padding:'10px 18px', borderRadius:8, background:'transparent', border:`1px solid ${C.border}`, color:C.muted, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { user } = useSelector(s => s.auth)
  const { workspaces, loading } = useSelector(s => s.workspace)
  const [showCreate, setShowCreate] = useState(false)
  const [joinId, setJoinId] = useState('')
  const [newWs, setNewWs] = useState({ name:'', language:'javascript', description:'' })
  const [searchQ, setSearchQ] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [openMenuWsId, setOpenMenuWsId] = useState(null)
  const [showInfoWs, setShowInfoWs] = useState(null)
  const [showShareWs, setShowShareWs] = useState(null)
  const [renameWs, setRenameWs] = useState(null)
  const [localWorkspaces, setLocalWorkspaces] = useState([])

  useEffect(() => { dispatch(fetchWorkspaces()) }, [])
  useEffect(() => { setLocalWorkspaces(workspaces) }, [workspaces])

  useEffect(() => {
    if (!showUserMenu) return
    const close = () => setShowUserMenu(false)
    const t = setTimeout(() => document.addEventListener('click', close), 10)
    return () => { clearTimeout(t); document.removeEventListener('click', close) }
  }, [showUserMenu])

  const handleCreate = async () => {
    if (!newWs.name.trim()) { toast.error('Please enter a workspace name'); return }
    const res = await dispatch(createWorkspace(newWs))
    if (res.meta.requestStatus === 'fulfilled') {
      toast.success(`"${newWs.name}" created!`)
      setShowCreate(false)
      setNewWs({ name:'', language:'javascript', description:'' })
      navigate(`/workspace/${res.payload.workspace.id}`)
    } else toast.error(res.payload || 'Failed to create workspace')
  }

  const handleDelete = async (wsId) => {
    const res = await dispatch(deleteWorkspace(wsId))
    if (res.meta.requestStatus === 'fulfilled') toast.success('Workspace deleted')
    else toast.error(res.payload || 'Failed to delete')
    setDeleteConfirm(null)
  }

  const handleRenamed = (wsId, newName) => {
    setLocalWorkspaces(prev => prev.map(w => w.id === wsId ? {...w, name: newName} : w))
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const filtered = localWorkspaces.filter(w => w.name?.toLowerCase().includes(searchQ.toLowerCase()))
  const inp = (extra={}) => ({ width:'100%', padding:'10px 14px', background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:13, fontFamily:'inherit', outline:'none', ...extra })

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.text, display:'flex', flexDirection:'column', fontFamily:"'Syne',sans-serif" }}>

      {/* ── Topbar ── */}
      <div style={{ height:60, borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', padding:'0 28px', gap:16, background:C.surface, position:'sticky', top:0, zIndex:100 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:30,height:30,borderRadius:8,background:`linear-gradient(135deg,${C.accent},#ff7eb3)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15 }}>⌨️</div>
          <span style={{ fontWeight:800, fontSize:17 }}>DevSpace</span>
        </div>
        <div style={{ flex:1, display:'flex', justifyContent:'center' }}>
          <div style={{ position:'relative', width:'100%', maxWidth:380 }}>
            <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:C.muted, fontSize:14 }}>🔍</span>
            <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="Search workspaces..."
              style={{ width:'100%', padding:'8px 14px 8px 36px', borderRadius:9, background:C.bg, border:`1px solid ${C.border}`, color:C.text, fontSize:13, fontFamily:'inherit', outline:'none' }} />
          </div>
        </div>

        {/* User menu */}
        <div style={{ position:'relative', marginLeft:'auto' }}>
          <div onClick={e=>{e.stopPropagation(); setShowUserMenu(v=>!v)}}
            style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 12px', borderRadius:9, background:C.bg, border:`1px solid ${C.border}`, cursor:'pointer', transition:'border-color .15s', userSelect:'none' }}
            onMouseEnter={e=>e.currentTarget.style.borderColor=C.borderHover}
            onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
            <div style={{ width:32,height:32,borderRadius:'50%',background:`linear-gradient(135deg,${user?.color||C.accent}80,${user?.color||C.accent})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#fff',overflow:'hidden',flexShrink:0 }}>
              {user?.avatar_url ? <img src={user.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} /> : user?.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:600 }}>{user?.name}</div>
              <div style={{ fontSize:11, color:C.muted, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.email}</div>
            </div>
            <span style={{ color:C.muted, fontSize:10, marginLeft:2 }}>▾</span>
          </div>

          {showUserMenu && (
            <div onClick={e=>e.stopPropagation()} style={{ position:'absolute', top:'calc(100% + 8px)', right:0, background:C.surface, border:`1px solid ${C.borderHover}`, borderRadius:12, padding:'6px', minWidth:210, zIndex:200, boxShadow:'0 16px 48px rgba(0,0,0,0.7)' }}>
              <div style={{ padding:'10px 12px 10px', borderBottom:`1px solid ${C.border}`, marginBottom:4 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{user?.name}</div>
                <div style={{ fontSize:11, color:C.muted }}>{user?.email}</div>
              </div>
              {[
                { icon:'👤', label:'Profile Settings', action: () => { setShowUserMenu(false); setTimeout(() => navigate('/profile'), 0) } },
              ].map(item => (
                <button key={item.label} onClick={e => { e.stopPropagation(); item.action() }} style={{ width:'100%',display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background:'none',border:'none',color:C.text,cursor:'pointer',borderRadius:7,fontSize:13,fontFamily:'inherit',textAlign:'left' }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.alt}
                  onMouseLeave={e=>e.currentTarget.style.background='none'}>
                  <span>{item.icon}</span><span>{item.label}</span>
                </button>
              ))}
              <div style={{ borderTop:`1px solid ${C.border}`, marginTop:4, paddingTop:4 }}>
                <button onClick={()=>{dispatch(logout()); navigate('/')}} style={{ width:'100%',display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background:'none',border:'none',color:C.red,cursor:'pointer',borderRadius:7,fontSize:13,fontFamily:'inherit',textAlign:'left' }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,83,112,0.08)'}
                  onMouseLeave={e=>e.currentTarget.style.background='none'}>
                  <span>🚪</span><span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ flex:1, padding:'36px 48px', maxWidth:1280, width:'100%', margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:36 }}>
          <div>
            <h1 style={{ fontSize:30,fontWeight:800,letterSpacing:'-1.5px',marginBottom:4 }}>{greeting}, {user?.name?.split(' ')[0]} 👋</h1>
            <p style={{ color:C.muted,fontSize:14 }}>{loading?'Loading...':`${filtered.length} workspace${filtered.length!==1?'s':''}`}</p>
          </div>
          <button onClick={()=>setShowCreate(!showCreate)} style={{ padding:'11px 22px',borderRadius:9,background:C.accent,border:'none',color:'#fff',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit',boxShadow:`0 6px 24px ${C.accent}30`,display:'flex',alignItems:'center',gap:7 }}>✦ New Workspace</button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div style={{ background:C.surface,border:`1px solid ${C.accent}35`,borderRadius:14,padding:28,marginBottom:28,boxShadow:`0 8px 32px ${C.accent}10` }}>
            <h3 style={{ fontSize:15,fontWeight:700,marginBottom:20 }}>✦ Create New Workspace</h3>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:14 }}>
              <div>
                <label style={{ display:'block',fontSize:11,fontWeight:700,color:C.muted,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.5px' }}>Name</label>
                <input value={newWs.name} onChange={e=>setNewWs({...newWs,name:e.target.value})} onKeyDown={e=>e.key==='Enter'&&handleCreate()} placeholder="e.g. React Dashboard" style={inp()}
                  onFocus={e=>e.target.style.borderColor=C.accent} onBlur={e=>e.target.style.borderColor=C.border} />
              </div>
              <div>
                <label style={{ display:'block',fontSize:11,fontWeight:700,color:C.muted,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.5px' }}>Language</label>
                <select value={newWs.language} onChange={e=>setNewWs({...newWs,language:e.target.value})} style={inp({appearance:'none',cursor:'pointer'})}>
                  {['javascript','typescript','python','go','rust','java','cpp','html'].map(l=><option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <input value={newWs.description} onChange={e=>setNewWs({...newWs,description:e.target.value})} placeholder="Description (optional)" style={{...inp(),marginBottom:16}} />
            <div style={{display:'flex',gap:10}}>
              <button onClick={handleCreate} disabled={loading} style={{ padding:'10px 24px',borderRadius:8,background:C.accent,border:'none',color:'#fff',fontSize:13,fontWeight:600,cursor:loading?'not-allowed':'pointer',fontFamily:'inherit',opacity:loading?0.7:1 }}>{loading?'Creating...':'Create & Open'}</button>
              <button onClick={()=>setShowCreate(false)} style={{ padding:'10px 20px',borderRadius:8,background:'transparent',border:`1px solid ${C.border}`,color:C.text,fontSize:13,cursor:'pointer',fontFamily:'inherit' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Join bar */}
        <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:'13px 18px',marginBottom:32,display:'flex',alignItems:'center',gap:12 }}>
          <span style={{fontSize:15}}>🔗</span>
          <span style={{ fontSize:13,fontWeight:600,color:C.muted,whiteSpace:'nowrap' }}>Join Workspace</span>
          <input value={joinId} onChange={e=>setJoinId(e.target.value)} placeholder="Paste workspace ID" onKeyDown={e=>e.key==='Enter'&&joinId&&navigate(`/workspace/${joinId.trim()}`)}
            style={{ flex:1,padding:'8px 12px',background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,fontFamily:'monospace',outline:'none' }} />
          <button onClick={()=>joinId&&navigate(`/workspace/${joinId.trim()}`)} style={{ padding:'8px 18px',borderRadius:8,background:`${C.accent}20`,border:`1px solid ${C.accent}40`,color:C.accent,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap' }}>Join →</button>
        </div>

        <h2 style={{ fontSize:17,fontWeight:700,marginBottom:18 }}>Your Workspaces</h2>

        {loading && (
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16 }}>
            {[1,2,3].map(i=><div key={i} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:24,height:160,opacity:0.5 }} />)}
          </div>
        )}

        {!loading && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
            {filtered.length === 0 && (
              <div style={{ gridColumn:'1/-1',textAlign:'center',padding:'60px 0',color:C.muted }}>
                <div style={{fontSize:40,marginBottom:12}}>🗂️</div>
                <p style={{fontSize:15,fontWeight:600}}>{searchQ?'No matching workspaces':'No workspaces yet'}</p>
                <p style={{fontSize:13,marginTop:4,color:C.dim}}>{searchQ?'Try a different search':'Create your first workspace to get started'}</p>
              </div>
            )}
            {filtered.map(ws => {
              const lc = LANG_COLORS[ws.language] || LANG_COLORS.default
              const icon = LANG_ICONS[ws.language] || LANG_ICONS.default
              const isOwner = ws.owner_id === user?.id || ws.role === 'owner'
              return (
                <div key={ws.id} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:13, padding:22, cursor:'pointer', transition:'all .2s', position:'relative', overflow:'visible' }}
                  onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-3px)';e.currentTarget.style.borderColor=C.borderHover;e.currentTarget.style.boxShadow='0 12px 40px #00000060'}}
                  onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.borderColor=C.border;e.currentTarget.style.boxShadow=''}}
                  onClick={()=>navigate(`/workspace/${ws.id}`)}>

                  {/* 3-dot menu button */}
                  <div style={{ position:'absolute', top:10, right:10 }} onClick={e=>e.stopPropagation()}>
                    <button
                      onClick={e=>{e.stopPropagation(); setOpenMenuWsId(id=>id===ws.id?null:ws.id)}}
                      style={{ background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:17, padding:'3px 7px', borderRadius:6, lineHeight:1, fontFamily:'inherit', transition:'all .15s' }}
                      onMouseEnter={e=>{e.currentTarget.style.background=C.alt;e.currentTarget.style.color=C.text}}
                      onMouseLeave={e=>{e.currentTarget.style.background='none';e.currentTarget.style.color=C.muted}}
                      title="Options">⋯</button>
                    {openMenuWsId === ws.id && (
                      <WsMenu ws={ws} onClose={()=>setOpenMenuWsId(null)} onRename={setRenameWs} onDelete={id=>{setOpenMenuWsId(null);setDeleteConfirm(id)}} onInfo={setShowInfoWs} onShare={setShowShareWs} />
                    )}
                  </div>

                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14, paddingRight:28 }}>
                    <div style={{ width:42,height:42,borderRadius:10,background:`${lc}15`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,border:`1px solid ${lc}20` }}>{icon}</div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                      <span style={{ fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:4,background:`${lc}18`,color:lc,border:`1px solid ${lc}30`,fontFamily:'monospace' }}>{ws.language||'js'}</span>
                      {isOwner && <span style={{ fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:4,background:`${C.accent}15`,color:C.accent,border:`1px solid ${C.accent}25` }}>OWNER</span>}
                    </div>
                  </div>
                  <h3 style={{ fontSize:14,fontWeight:700,marginBottom:3,paddingRight:10 }}>{ws.name}</h3>
                  {ws.description && <p style={{ fontSize:12,color:C.muted,marginBottom:6,lineHeight:1.5 }}>{ws.description}</p>}
                  <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:10,borderTop:`1px solid ${C.border}`,marginTop:8 }}>
                    <span style={{ fontSize:10,color:C.dim,fontFamily:'monospace' }}>/{ws.id}</span>
                    <span style={{ fontSize:11,color:C.muted }}>{ws.collaboratorCount||1} member{ws.collaboratorCount!==1?'s':''}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {deleteConfirm && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center' }} onClick={()=>setDeleteConfirm(null)}>
          <div style={{ background:C.surface,border:`1px solid ${C.red}40`,borderRadius:14,padding:30,width:380,textAlign:'center' }} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:36,marginBottom:12}}>🗑️</div>
            <h3 style={{fontSize:17,fontWeight:700,marginBottom:8}}>Delete Workspace?</h3>
            <p style={{color:C.muted,fontSize:13,marginBottom:24,lineHeight:1.6}}>This will permanently delete the workspace and all files. Cannot be undone.</p>
            <div style={{display:'flex',gap:10,justifyContent:'center'}}>
              <button onClick={()=>handleDelete(deleteConfirm)} style={{padding:'10px 24px',borderRadius:8,background:C.red,border:'none',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Yes, Delete</button>
              <button onClick={()=>setDeleteConfirm(null)} style={{padding:'10px 20px',borderRadius:8,background:'transparent',border:`1px solid ${C.border}`,color:C.text,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showInfoWs && <WsInfoModal ws={showInfoWs} onClose={()=>setShowInfoWs(null)} />}
      {showShareWs && <ShareModal ws={showShareWs} onClose={()=>setShowShareWs(null)} />}
      {renameWs && <RenameModal ws={renameWs} onClose={()=>setRenameWs(null)} onRenamed={handleRenamed} />}
    </div>
  )
}
// share modal: WhatsApp, email, Telegram, Twitter, copy link, native share

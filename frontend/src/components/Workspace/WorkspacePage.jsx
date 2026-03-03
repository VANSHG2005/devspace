import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import MonacoEditor from '@monaco-editor/react'
import { fetchWorkspace } from '../../store/slices/workspaceSlice'
import { fetchFiles, createFile, deleteFile, setActiveFile, setCode, executeCode, fetchVersions, restoreVersion, clearExecutionOutput } from '../../store/slices/editorSlice'
import { setActivePanel } from '../../store/slices/uiSlice'
import useSocket from '../../hooks/useSocket'
import useAutoSave from '../../hooks/useAutoSave'
import useWebRTC from '../../hooks/useWebRTC'
import { emitCodeChange, emitCursorMove, emitSendMessage, emitTypingStart, emitTypingStop, emitTerminalInput, emitBoardStroke, emitBoardClear, emitBoardRequest, getSocket, EVENTS } from '../../utils/socket'
import { toast } from 'react-toastify'
import api from '../../utils/api'
import { useIsMobile } from '../../hooks/useIsMobile'

// ── File type icon ────────────────────────────────────────────────────────────
function FileIcon({ ext }) {
  const m = { js:'#ffca28',ts:'#82aaff',py:'#3dffa0',jsx:'#ffca28',tsx:'#82aaff',json:'#ff9f43',md:'#6e6e8f',css:'#ff7eb3',html:'#ff9f43',sql:'#89ddff' }
  return <span style={{ fontSize:10,color:m[ext]||'#6e6e8f',fontFamily:'monospace',fontWeight:700 }}>{(ext||'txt').toUpperCase()}</span>
}

// ── Resizable drag handle ─────────────────────────────────────────────────────
function DragHandle({ onDrag }) {
  const dragging = useRef(false)
  const down = (e) => {
    e.preventDefault(); dragging.current = true
    document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none'
    const move = (ev) => { if (dragging.current) onDrag(ev.clientX) }
    const up = () => { dragging.current = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  return <div onMouseDown={down} style={{ width:5,flexShrink:0,background:'transparent',cursor:'ew-resize',position:'relative',zIndex:10,transition:'background .2s' }} onMouseEnter={e=>e.currentTarget.style.background='rgba(124,106,247,0.4)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'} />
}

// ── File/Folder 3-dot menu ────────────────────────────────────────────────────
function FileMenu({ file, isFolder, onClose, onRename, onDelete, onDownload, workspaceId }) {
  const ref = useRef(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    setTimeout(() => document.addEventListener('mousedown', h), 0)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const copyLink = () => {
    const link = `${window.location.origin}/workspace/${workspaceId}`
    navigator.clipboard.writeText(link); setCopied(true); toast.success('Link copied!'); setTimeout(()=>setCopied(false),2000)
  }
  const downloadFile = () => {
    const content = file.content || ''
    const blob = new Blob([content], { type:'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = file.name.split('/').pop(); a.click()
    URL.revokeObjectURL(url); onClose()
  }

  const items = isFolder ? [
    { icon:'✏️', label:'Rename', action: ()=>{onRename(file);onClose()} },
    { divider:true },
    { icon:'🗑️', label:'Delete Folder', danger:true, action:()=>{onDelete(file);onClose()} },
  ] : [
    { icon:'✏️', label:'Rename', action:()=>{onRename(file);onClose()} },
    { icon:'⬇️', label:'Download', action:()=>downloadFile() },
    { icon: copied?'✓':'🔗', label: copied?'Copied!':'Copy Link', action:()=>copyLink() },
    { divider:true },
    { icon:'🗑️', label:'Delete', danger:true, action:()=>{onDelete(file);onClose()} },
  ]

  return (
    <div ref={ref} style={{ position:'absolute',top:24,right:0,background:'#16161f',border:'1px solid #2d2d42',borderRadius:9,padding:'4px',minWidth:152,zIndex:500,boxShadow:'0 12px 40px rgba(0,0,0,0.8)' }}>
      {items.map((item,i) => item.divider
        ? <div key={i} style={{ height:1,background:'#1e1e2e',margin:'3px 0' }}/>
        : <button key={i} onClick={e=>{e.stopPropagation();item.action()}}
            style={{ width:'100%',display:'flex',alignItems:'center',gap:8,padding:'7px 9px',background:'none',border:'none',color:item.danger?'#ff5370':'#e2e2f0',cursor:'pointer',borderRadius:6,fontSize:12,fontFamily:'inherit',textAlign:'left' }}
            onMouseEnter={e=>e.currentTarget.style.background=item.danger?'rgba(255,83,112,0.08)':'#1e1e2e'}
            onMouseLeave={e=>e.currentTarget.style.background='none'}>
            <span style={{width:16,textAlign:'center'}}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
      )}
    </div>
  )
}

// ── File row with 3-dot menu ──────────────────────────────────────────────────
function FileRow({ file, isActive, onSelect, onRename, onDelete, workspaceId, indent=0 }) {
  const ext = file.name.split('/').pop().split('.').pop()
  const [menuOpen, setMenuOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  return (
    <div style={{ position:'relative', display:'flex', alignItems:'center', gap:7, padding:`6px ${8+indent*12}px 6px ${12+indent*12}px`, cursor:'pointer', background:isActive?'rgba(124,106,247,0.1)':'transparent', borderLeft:isActive?'2px solid #7c6af7':'2px solid transparent', transition:'all .12s' }}
      onClick={onSelect} onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}>
      <FileIcon ext={ext} />
      <span style={{ fontSize:12,flex:1,color:isActive?'#e2e2f0':'#6e6e8f',fontFamily:'monospace',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{file.name.split('/').pop()}</span>
      {(hovered || menuOpen) && (
        <button onClick={e=>{e.stopPropagation();setMenuOpen(v=>!v)}} style={{ background:'none',border:'none',color:'#6e6e8f',cursor:'pointer',padding:'1px 5px',fontSize:13,flexShrink:0,borderRadius:4,lineHeight:1 }}
          onMouseEnter={e=>e.currentTarget.style.color='#e2e2f0'} onMouseLeave={e=>e.currentTarget.style.color='#6e6e8f'}>⋯</button>
      )}
      {menuOpen && <FileMenu file={file} isFolder={false} onClose={()=>setMenuOpen(false)} onRename={onRename} onDelete={onDelete} workspaceId={workspaceId} />}
    </div>
  )
}

// ── Folder row with 3-dot menu ────────────────────────────────────────────────
function FolderRow({ folder, isOpen, onToggle, onRename, onDelete, workspaceId, children }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  return (
    <div>
      <div style={{ position:'relative', display:'flex', alignItems:'center', gap:6, padding:'5px 8px 5px 10px', cursor:'pointer', userSelect:'none' }}
        onClick={onToggle} onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}>
        <span style={{ fontSize:9,color:'#ffca28',width:10 }}>{isOpen?'▾':'▸'}</span>
        <span style={{ fontSize:12 }}>📁</span>
        <span style={{ fontSize:12,fontFamily:'monospace',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#6e6e8f' }}>{folder.folderName}</span>
        {(hovered || menuOpen) && (
          <button onClick={e=>{e.stopPropagation();setMenuOpen(v=>!v)}} style={{ background:'none',border:'none',color:'#6e6e8f',cursor:'pointer',padding:'1px 5px',fontSize:13,flexShrink:0,borderRadius:4,lineHeight:1 }}
            onMouseEnter={e=>e.currentTarget.style.color='#e2e2f0'} onMouseLeave={e=>e.currentTarget.style.color='#6e6e8f'}>⋯</button>
        )}
        {menuOpen && <FileMenu file={{...folder,name:folder.folderName}} isFolder={true} onClose={()=>setMenuOpen(false)} onRename={f=>onRename({...folder,name:folder.folderName})} onDelete={()=>onDelete(folder)} workspaceId={workspaceId} />}
      </div>
      {isOpen && children}
    </div>
  )
}

// ── Video element (fixes mirror for camera) ───────────────────────────────────
function VideoEl({ stream, muted, height, mirror=false }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && stream) { ref.current.srcObject = stream; ref.current.play().catch(()=>{}) }
  }, [stream])
  return <video ref={ref} autoPlay muted={muted} playsInline style={{ width:'100%', height, objectFit:'contain', display:'block', background:'#000', transform: mirror?'scaleX(-1)':'none' }} />
}

// ── Floating media window (screen share / camera) ─────────────────────────────
function FloatingMedia({ streams, onClose }) {
  const [pos, setPos] = useState({ x: Math.max(20, window.innerWidth-380), y: Math.max(20, window.innerHeight-270) })
  const [expanded, setExpanded] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const dragging = useRef(false); const offset = useRef({x:0,y:0})
  const W = expanded ? Math.min(window.innerWidth-40,880) : 340
  const H = expanded ? Math.min(window.innerHeight-40,560) : (minimized?36:220)
  const X = expanded?20:pos.x; const Y = expanded?20:pos.y

  const startDrag = (e) => {
    if (expanded||e.target.closest('button')) return
    dragging.current = true; offset.current = {x:e.clientX-pos.x,y:e.clientY-pos.y}
    const move = ev => dragging.current && setPos({x:Math.max(0,Math.min(window.innerWidth-W,ev.clientX-offset.current.x)),y:Math.max(0,Math.min(window.innerHeight-H,ev.clientY-offset.current.y))})
    const up = () => { dragging.current=false; window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up) }
    window.addEventListener('mousemove',move); window.addEventListener('mouseup',up)
  }

  if (!streams || streams.length===0) return null
  const sb = (color) => ({ background:`${color}25`,border:`1px solid ${color}60`,color,borderRadius:5,padding:'2px 8px',cursor:'pointer',fontSize:12,fontWeight:700,lineHeight:1.5,fontFamily:'inherit' })

  return (
    <div style={{ position:'fixed',left:X,top:Y,width:W,zIndex:9999,background:'#0a0a0f',border:'2px solid #7c6af7',borderRadius:12,overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,0.95)',transition:expanded?'all 0.2s cubic-bezier(.16,1,.3,1)':'none' }}>
      <div onMouseDown={startDrag} style={{ height:36,background:'#16161f',display:'flex',alignItems:'center',padding:'0 10px',gap:6,cursor:expanded?'default':'move',userSelect:'none',borderBottom:'1px solid #1e1e2e' }}>
        <span style={{ fontSize:11,color:'#7c6af7',fontWeight:700,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>📺 {streams.map(s=>s.name).join(' · ')}</span>
        <button onClick={()=>setMinimized(m=>!m)} style={sb('#6e6e8f')}>{minimized?'▲':'▬'}</button>
        <button onClick={()=>setExpanded(e=>!e)} style={sb('#82aaff')}>{expanded?'⊡':'⊞'}</button>
        <button title="Hide window (streams stay active)" onClick={onClose} style={sb('#f0c060')}>⊟</button>
        <button title="Close streams" onClick={onStopAll} style={sb('#ff5370')}>✕</button>
      </div>
      {!minimized && (
        <div style={{ display:'grid',gridTemplateColumns:streams.length>1?'1fr 1fr':'1fr',background:'#000',gap:1 }}>
          {streams.map((s,i) => (
            <div key={i} style={{ position:'relative' }}>
              {/* Mirror based on stream.mirror property set by useWebRTC */}
              <VideoEl stream={s.stream} muted={s.muted} height={streams.length>1?(H-36)/2:H-36} mirror={s.mirror ?? s.kind==='camera-local'} />
              <div style={{ position:'absolute',bottom:6,left:8,background:'rgba(0,0,0,0.75)',padding:'2px 8px',borderRadius:4,fontSize:11,color:'#fff' }}>{s.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Camera effects panel ──────────────────────────────────────────────────────
const VIRTUAL_BACKGROUNDS = [
  { id:'none',    label:'None',         color:'#1e1e2e',  preview:'#1e1e2e' },
  { id:'blur',    label:'Blur BG',      color:'#0a0a0f',  preview:'blur' },
  { id:'space',   label:'Space',        url:'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=400&q=80' },
  { id:'office',  label:'Office',       url:'https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&q=80' },
  { id:'nature',  label:'Nature',       url:'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&q=80' },
  { id:'city',    label:'City Night',   url:'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400&q=80' },
  { id:'beach',   label:'Beach',        url:'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&q=80' },
  { id:'devspace',label:'DevSpace',     color:'linear-gradient(135deg,#0a0a0f 0%,#1a1040 50%,#0d0d20 100%)' },
]

function CameraEffects({ stream, onClose }) {
  const [blur, setBlur] = useState(0)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [bgId, setBgId] = useState('none')
  const [customBg, setCustomBg] = useState(null)
  const [tab, setTab] = useState('effects')  // 'effects' | 'background'
  const previewRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (previewRef.current && stream) { previewRef.current.srcObject = stream; previewRef.current.play().catch(()=>{}) }
  }, [stream])

  const filter = `blur(${blur}px) brightness(${brightness}%) contrast(${contrast}%)`
  const selectedBg = VIRTUAL_BACKGROUNDS.find(b=>b.id===bgId)

  const handleUploadBg = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setCustomBg(url)
    setBgId('custom')
  }

  const getBgStyle = (bg) => {
    if (!bg || bg.id==='none') return {}
    if (bg.id==='blur') return { backdropFilter:'blur(20px)', background:'rgba(0,0,0,0.3)' }
    if (bg.id==='custom' && customBg) return { backgroundImage:`url(${customBg})`, backgroundSize:'cover', backgroundPosition:'center' }
    if (bg.url) return { backgroundImage:`url(${bg.url})`, backgroundSize:'cover', backgroundPosition:'center' }
    if (bg.color) return { background: bg.color }
    return {}
  }

  const tabBtn = (id,label) => ({
    flex:1, padding:'8px', border:'none', borderRadius:7, cursor:'pointer', fontFamily:'inherit',
    fontSize:12, fontWeight:700, background: tab===id ? '#7c6af7' : 'transparent',
    color: tab===id ? '#fff' : '#6e6e8f', transition:'all .15s'
  })

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',zIndex:600,display:'flex',alignItems:'center',justifyContent:'center' }} onClick={onClose}>
      <div style={{ background:'#111118',border:'1px solid #1e1e2e',borderRadius:16,padding:24,width:480,maxWidth:'95vw',maxHeight:'90vh',overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16 }}>
          <h3 style={{ fontSize:16,fontWeight:700,color:'#e2e2f0',margin:0 }}>📷 Camera Settings</h3>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.08)',border:'none',color:'#6e6e8f',cursor:'pointer',width:28,height:28,borderRadius:6,fontSize:14 }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex',gap:6,marginBottom:16,background:'#0a0a0f',borderRadius:9,padding:4 }}>
          <button style={tabBtn('effects','🎨 Effects')} onClick={()=>setTab('effects')}>🎨 Effects</button>
          <button style={tabBtn('background','🖼️ Background')} onClick={()=>setTab('background')}>🖼️ Background</button>
        </div>

        {/* Live preview */}
        <div style={{ position:'relative',marginBottom:16,borderRadius:10,overflow:'hidden',background:'#000',aspectRatio:'16/9' }}>
          <div style={{ position:'absolute',inset:0,...getBgStyle(bgId==='custom'?{id:'custom',url:customBg}:selectedBg) }} />
          <video ref={previewRef} autoPlay muted playsInline style={{ position:'relative',width:'100%',height:'100%',objectFit:'cover',transform:'scaleX(-1)',filter,mixBlendMode: bgId!=='none'?'luminosity':'normal' }} />
          <div style={{ position:'absolute',bottom:8,left:8,background:'rgba(0,0,0,0.7)',padding:'2px 8px',borderRadius:4,fontSize:10,color:'#7c6af7',fontWeight:700 }}>PREVIEW</div>
        </div>

        {tab==='effects' && (
          <>
            {[
              { label:'Background Blur', val:blur, set:setBlur, min:0, max:20, unit:'px', icon:'🌫️' },
              { label:'Brightness', val:brightness, set:setBrightness, min:50, max:200, unit:'%', icon:'☀️' },
              { label:'Contrast', val:contrast, set:setContrast, min:50, max:200, unit:'%', icon:'◑' },
            ].map(ctrl => (
              <div key={ctrl.label} style={{ marginBottom:14 }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6 }}>
                  <span style={{ fontSize:13,color:'#e2e2f0',fontWeight:600 }}>{ctrl.icon} {ctrl.label}</span>
                  <span style={{ fontSize:12,color:'#7c6af7',fontFamily:'monospace',fontWeight:700 }}>{ctrl.val}{ctrl.unit}</span>
                </div>
                <input type="range" min={ctrl.min} max={ctrl.max} value={ctrl.val} onChange={e=>ctrl.set(+e.target.value)}
                  style={{ width:'100%',accentColor:'#7c6af7',cursor:'pointer' }} />
              </div>
            ))}
          </>
        )}

        {tab==='background' && (
          <>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12 }}>
              {VIRTUAL_BACKGROUNDS.map(bg => (
                <div key={bg.id} onClick={()=>setBgId(bg.id)}
                  style={{ aspectRatio:'16/9',borderRadius:8,overflow:'hidden',cursor:'pointer',border:`2px solid ${bgId===bg.id?'#7c6af7':'transparent'}`,transition:'border-color .15s',position:'relative',
                    ...(bg.url ? {backgroundImage:`url(${bg.url})`,backgroundSize:'cover',backgroundPosition:'center'} : {background:bg.color||'#1e1e2e'}) }}>
                  {bg.id==='blur' && <div style={{ position:'absolute',inset:0,backdropFilter:'blur(4px)',background:'rgba(0,0,0,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18 }}>🌫️</div>}
                  <div style={{ position:'absolute',bottom:0,left:0,right:0,background:'rgba(0,0,0,0.65)',padding:'2px 4px',fontSize:9,color:'#fff',textAlign:'center',fontWeight:600 }}>{bg.label}</div>
                  {bgId===bg.id && <div style={{ position:'absolute',top:4,right:4,width:14,height:14,borderRadius:'50%',background:'#7c6af7',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,color:'#fff',fontWeight:900 }}>✓</div>}
                </div>
              ))}
              {/* Custom upload tile */}
              <div onClick={()=>fileInputRef.current?.click()}
                style={{ aspectRatio:'16/9',borderRadius:8,border:`2px dashed ${bgId==='custom'?'#7c6af7':'#3a3a55'}`,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,background:'#0a0a0f',transition:'border-color .15s',
                  ...(customBg?{backgroundImage:`url(${customBg})`,backgroundSize:'cover',backgroundPosition:'center'}:{}) }}>
                <span style={{ fontSize:18 }}>📁</span>
                <span style={{ fontSize:9,color:'#6e6e8f',fontWeight:600 }}>Upload</span>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUploadBg} style={{ display:'none' }} />
            <p style={{ fontSize:11,color:'#6e6e8f',margin:'0 0 12px' }}>💡 Virtual background is a visual effect only — it doesn't process the actual video stream.</p>
          </>
        )}

        <div style={{ display:'flex',gap:10,marginTop:8 }}>
          <button onClick={()=>{setBlur(0);setBrightness(100);setContrast(100);setBgId('none');setCustomBg(null)}} style={{ flex:1,padding:'9px',borderRadius:8,background:'transparent',border:'1px solid #1e1e2e',color:'#6e6e8f',cursor:'pointer',fontFamily:'inherit',fontSize:12 }}>Reset All</button>
          <button onClick={onClose} style={{ flex:2,padding:'9px',borderRadius:8,background:'#7c6af7',border:'none',color:'#fff',cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:700 }}>Apply & Close</button>
        </div>
      </div>
    </div>
  )
}

// ── Rename file/folder modal ──────────────────────────────────────────────────
function RenameFileModal({ item, isFolder, onClose, onRenamed }) {
  const cleanName = isFolder ? item.folderName || item.name : item.name.split('/').pop()
  const [name, setName] = useState(cleanName)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || name.trim() === cleanName) { onClose(); return }
    setSaving(true)
    try {
      await api.put(`/files/${item.id}`, { name: name.trim() })
      toast.success(`Renamed to "${name.trim()}"`)
      onRenamed(item.id, name.trim())
      onClose()
    } catch { toast.error('Failed to rename') }
    setSaving(false)
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:510,display:'flex',alignItems:'center',justifyContent:'center' }} onClick={onClose}>
      <div style={{ background:'#111118',border:'1px solid #1e1e2e',borderRadius:14,padding:28,width:380 }} onClick={e=>e.stopPropagation()}>
        <h3 style={{ fontSize:15,fontWeight:700,marginBottom:20 }}>✏️ Rename {isFolder?'Folder':'File'}</h3>
        <input autoFocus value={name} onChange={e=>setName(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter')handleSave();if(e.key==='Escape')onClose()}}
          style={{ width:'100%',padding:'11px 14px',background:'#0d0d14',border:'1px solid #7c6af7',borderRadius:9,color:'#e2e2f0',fontSize:14,fontFamily:'inherit',outline:'none',marginBottom:20 }} />
        <div style={{ display:'flex',gap:10 }}>
          <button onClick={handleSave} disabled={saving||!name.trim()} style={{ flex:1,padding:'10px',borderRadius:8,background:'#7c6af7',border:'none',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit',opacity:saving?0.7:1 }}>{saving?'Saving...':'Rename'}</button>
          <button onClick={onClose} style={{ padding:'10px 18px',borderRadius:8,background:'transparent',border:'1px solid #1e1e2e',color:'#6e6e8f',fontSize:13,cursor:'pointer',fontFamily:'inherit' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function Modal({ children, onClose, width=390 }) {
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center' }} onClick={onClose}>
      <div style={{ background:'#111118',border:'1px solid #1e1e2e',borderRadius:14,padding:24,width,maxHeight:'85vh',overflowY:'auto' }} onClick={e=>e.stopPropagation()}>{children}</div>
    </div>
  )
}

// ── Main WorkspacePage ────────────────────────────────────────────────────────
export default function WorkspacePage() {
  const { id: workspaceId } = useParams()
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const { user } = useSelector(s => s.auth)
  const { current: workspace, onlineUsers, messages } = useSelector(s => s.workspace)
  const { files, activeFileId, code, language, savedStatus, versions, executionOutput, executionLoading } = useSelector(s => s.editor)
  const { typingUsers, activePanel, cursors } = useSelector(s => s.ui)

  const [sidebarW, setSidebarW] = useState(210)
  const [rightW, setRightW] = useState(320)
  const bodyRef = useRef(null)
  const handleSidebarDrag = useCallback((cx) => {
    if (!bodyRef.current) return
    setSidebarW(Math.max(150, Math.min(440, cx - bodyRef.current.getBoundingClientRect().left)))
  }, [])
  const handleRightDrag = useCallback((cx) => {
    if (!bodyRef.current) return
    setRightW(Math.max(240, Math.min(620, bodyRef.current.getBoundingClientRect().right - cx)))
  }, [])

  const [newMsg, setNewMsg] = useState('')
  const [addingItem, setAddingItem] = useState(null)
  const [newItemName, setNewItemName] = useState('')
  const [openFolders, setOpenFolders] = useState({})
  const [showVersions, setShowVersions] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')
  const [inviteSending, setInviteSending] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [aiMessages, setAiMessages] = useState([{ role:'assistant', text:'👋 Ask me anything about your code!' }])
  const [aiLoading, setAiLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [wbMode, setWbMode] = useState('pen')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [cursorPos, setCursorPos] = useState({x:-100,y:-100})
  const [wbColor, setWbColor] = useState('#7c6af7')
  const [wbSize, setWbSize] = useState(3)
  const [wbOffset, setWbOffset] = useState({x:0,y:0})
  const wbOffsetRef = useRef({x:0,y:0})   // ref so redrawCanvas always reads latest
  const [wbScale, setWbScale] = useState(1)
  const wbScaleRef = useRef(1)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [mediaStreams, setMediaStreams] = useState([])
  const [mediaWindowOpen, setMediaWindowOpen] = useState(true)
  const [showCameraEffects, setShowCameraEffects] = useState(false)
  const [renameItem, setRenameItem] = useState(null)
  const [localFiles, setLocalFiles] = useState([])
  const isMobile = useIsMobile()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)
  const [wbFullscreen, setWbFullscreen] = useState(false)
  const [termInput, setTermInput] = useState('')
  const [termLines, setTermLines] = useState([{ text: 'DevSpace Terminal — type commands below', type: 'info' }])
  const [termHistory, setTermHistory] = useState([])
  const [termHistIdx, setTermHistIdx] = useState(-1)
  const [showPreview, setShowPreview] = useState(false)
  const termEndRef = useRef(null)
  const termInputRef = useRef(null)

  const chatEndRef = useRef(null)
  const typingRef = useRef(null)
  const canvasRef = useRef(null)
  const drawing = useRef(false); const lastPos = useRef(null)
  const panning = useRef(false); const panStart = useRef(null)
  const strokesRef = useRef([])   // persist all strokes for infinite canvas
  const currentStroke = useRef([])
  const editorRef = useRef(null); const decsRef = useRef([])

  useSocket(workspaceId)
  useAutoSave(workspaceId)

  // Keep refs in sync with state so canvas callbacks always read latest values
  useEffect(() => { wbOffsetRef.current = wbOffset }, [wbOffset])
  useEffect(() => { wbScaleRef.current = wbScale }, [wbScale])

  // ── Terminal socket output ──────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const handler = ({ line, type }) => {
      setTermLines(prev => [...prev, { text: line, type: type || 'result' }])
    }
    socket.on(EVENTS.TERMINAL_OUTPUT, handler)
    return () => socket.off(EVENTS.TERMINAL_OUTPUT, handler)
  }, [workspaceId])

  // ── Board socket sync ────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    // Someone drew a new stroke
    const onStroke = ({ stroke }) => {
      if (!stroke) return
      strokesRef.current.push(stroke)
      redrawCanvas()
    }
    // Someone cleared the board
    const onClear = () => {
      strokesRef.current = []
      redrawCanvas()
    }
    // Server sends full board state on join
    const onSync = ({ strokes }) => {
      if (!strokes?.length) return
      strokesRef.current = strokes
      redrawCanvas()
    }

    socket.on(EVENTS.BOARD_STROKE, onStroke)
    socket.on(EVENTS.BOARD_CLEAR,  onClear)
    socket.on(EVENTS.BOARD_SYNC,   onSync)

    // Request current board state when joining
    emitBoardRequest(workspaceId)

    return () => {
      socket.off(EVENTS.BOARD_STROKE, onStroke)
      socket.off(EVENTS.BOARD_CLEAR,  onClear)
      socket.off(EVENTS.BOARD_SYNC,   onSync)
    }
  }, [workspaceId])

  useEffect(() => {
    termEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [termLines])

  const handleTermSubmit = (e) => {
    if (e.key === 'Enter' && termInput.trim()) {
      const cmd = termInput.trim()
      setTermHistory(h => [cmd, ...h.slice(0, 49)])
      setTermHistIdx(-1)
      setTermInput('')
      emitTerminalInput(workspaceId, cmd)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setTermHistIdx(i => {
        const next = Math.min(i + 1, termHistory.length - 1)
        setTermInput(termHistory[next] || '')
        return next
      })
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setTermHistIdx(i => {
        const next = Math.max(i - 1, -1)
        setTermInput(next === -1 ? '' : termHistory[next] || '')
        return next
      })
    }
  }
  const handleSetMediaStreams = (updater) => {
    setMediaStreams(updater)
    setMediaWindowOpen(true)  // auto-show window when any stream is added
  }
  const { micOn, screenOn, cameraOn, startVoiceChat, stopVoiceChat, startScreenShare, stopScreenShare, startCameraShare, stopCameraShare } = useWebRTC(workspaceId, handleSetMediaStreams)

  // Sync localFiles with redux files
  useEffect(() => { setLocalFiles(files) }, [files])

  useEffect(() => {
    dispatch(fetchWorkspace(workspaceId))
    dispatch(fetchFiles(workspaceId))
  }, [workspaceId])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  // Cursor styles
  useEffect(() => {
    let style = document.getElementById('live-cursor-css')
    if (!style) { style = document.createElement('style'); style.id='live-cursor-css'; document.head.appendChild(style) }
    style.textContent = (onlineUsers||[]).filter(u=>u.id!==user?.id).map(u=>`
      .cur-${u.id}{border-left:2px solid ${u.color||'#7c6af7'} !important}
      .sel-${u.id}{background:${u.color||'#7c6af7'}28 !important}
    `).join('')
  }, [onlineUsers, user?.id])

  // Monaco cursor decorations
  useEffect(() => {
    const editor = editorRef.current; if (!editor||!cursors) return
    const decs = []
    Object.entries(cursors).forEach(([uid,cur]) => {
      if (uid===user?.id||!cur.line) return
      decs.push({ range:{startLineNumber:cur.line,startColumn:cur.col,endLineNumber:cur.line,endColumn:cur.col}, options:{className:`cur-${uid}`,hoverMessage:{value:`**${cur.name}**`},stickiness:1} })
      if (cur.selection && (cur.selection.startLine!==cur.selection.endLine||cur.selection.startCol!==cur.selection.endCol)) {
        decs.push({ range:{startLineNumber:cur.selection.startLine,startColumn:cur.selection.startCol,endLineNumber:cur.selection.endLine,endColumn:cur.selection.endCol}, options:{className:`sel-${uid}`,stickiness:1} })
      }
    })
    decsRef.current = editor.deltaDecorations(decsRef.current||[], decs)
  }, [cursors, activeFileId, user?.id])

  const handleCodeChange = useCallback((v) => {
    dispatch(setCode(v)); emitCodeChange(workspaceId, activeFileId, v)
    if (typingRef.current) clearTimeout(typingRef.current)
    emitTypingStart(workspaceId)
    typingRef.current = setTimeout(()=>emitTypingStop(workspaceId), 1500)
  }, [workspaceId, activeFileId])

  const handleEditorMount = useCallback((editor) => {
    editorRef.current = editor
    editor.onDidChangeCursorPosition(() => {
      const pos = editor.getPosition(); const sel = editor.getSelection()
      if (pos) emitCursorMove(workspaceId, activeFileId, { lineNumber:pos.lineNumber, column:pos.column, selection:sel?{startLine:sel.startLineNumber,startCol:sel.startColumn,endLine:sel.endLineNumber,endCol:sel.endColumn}:null })
    })
  }, [workspaceId, activeFileId])

  const sendMessage = () => { if (!newMsg.trim()) return; emitSendMessage(workspaceId, newMsg); setNewMsg('') }

  // File tree builder
  const fileTree = React.useMemo(() => {
    const folders = {}, rootFiles = []
    localFiles.forEach(f => { if (f.name.endsWith('/.folder')) { const fn=f.name.replace('/.folder',''); folders[fn]={...f,folderName:fn,children:[]} } })
    localFiles.forEach(f => {
      if (f.name.endsWith('/.folder')) return
      const parts = f.name.split('/')
      if (parts.length>1) { const fn=parts.slice(0,-1).join('/'); if (folders[fn]) { folders[fn].children.push(f); return } }
      rootFiles.push(f)
    })
    return { folders:Object.values(folders), rootFiles }
  }, [localFiles])

  const handleAddItem = async () => {
    if (!newItemName.trim()) return
    if (addingItem==='folder') {
      try { await api.post(`/workspaces/${workspaceId}/files`, { name:newItemName+'/.folder', language:'folder' }); dispatch(fetchFiles(workspaceId)); toast.success(`Folder "${newItemName}" created`) }
      catch { toast.error('Failed to create folder') }
    } else {
      const ext = newItemName.split('.').pop()
      const lm = {js:'javascript',ts:'typescript',py:'python',jsx:'react',tsx:'react-ts',css:'css',json:'json',md:'markdown',sql:'sql',html:'html',c:'c',cpp:'cpp',cc:'cpp',java:'java',go:'go',rs:'rust',rb:'ruby',php:'php',vue:'vue',svelte:'svelte'}
      try { await dispatch(createFile({ workspaceId, name:newItemName, language:lm[ext]||'plaintext' })).unwrap(); toast.success(`"${newItemName}" created`) }
      catch { toast.error('Failed to create file') }
    }
    setAddingItem(null); setNewItemName('')
  }

  const handleDeleteItem = async (item) => {
    const nonFolderFiles = localFiles.filter(f=>!f.name.endsWith('/.folder'))
    if (!item.name.endsWith('/.folder') && nonFolderFiles.length<=1) { toast.error('Cannot delete the last file'); return }
    try { await dispatch(deleteFile({ workspaceId, fileId:item.id })).unwrap(); toast.success(`Deleted "${item.name.split('/').pop()}"`) }
    catch { toast.error('Failed to delete') }
    setDeleteConfirm(null)
  }

  const handleFileRenamed = (fileId, newName) => {
    setLocalFiles(prev => prev.map(f => f.id===fileId ? {...f, name:newName} : f))
    dispatch(fetchFiles(workspaceId))
  }

  const handleRunCode = () => {
    const execLang = {
      javascript: 'javascript', typescript: 'typescript',
      python: 'python', c: 'c', cpp: 'cpp',
      java: 'java', go: 'go', rust: 'rust',
      html: 'html', react: 'react', vue: 'vue', svelte: 'svelte',
      js: 'javascript', ts: 'typescript', py: 'python',
      rs: 'rust', jsx: 'react', tsx: 'react-ts',
    }[language] || language

    // On mobile, always open the terminal/panel
    if (isMobile) { setMobileSidebarOpen(false); setMobilePanelOpen(true) }

    // HTML/React → open inline preview
    if (['html', 'tailwind', 'react', 'react-ts', 'jsx', 'tsx'].includes(execLang)) {
      setShowPreview(true)
      dispatch(setActivePanel('terminal'))
      return
    }

    setShowPreview(false)
    dispatch(setActivePanel('terminal'))
    setTermLines(prev => [...prev, { text: `▶ Running ${execLang}...`, type: 'info' }])
    dispatch(clearExecutionOutput())
    dispatch(executeCode({ code, language: execLang })).then(action => {
      if (action.payload) {
        const { output, error } = action.payload
        if (output) output.split('\n').forEach(l => setTermLines(p => [...p, { text: l, type: 'result' }]))
        if (error) error.split('\n').forEach(l => setTermLines(p => [...p, { text: l, type: 'error' }]))
      }
    })
  }

  const handleAskAI = async () => {
    if (!aiInput.trim()||aiLoading) return
    const q=aiInput; setAiMessages(p=>[...p,{role:'user',text:q}]); setAiInput(''); setAiLoading(true)
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${import.meta.env.VITE_GROQ_KEY}`}, body:JSON.stringify({ model:'llama-3.3-70b-versatile', max_tokens:1024, messages:[{role:'system',content:`Expert code assistant. Language: ${language}.`},{role:'user',content:`${q}\n\`\`\`${language}\n${code.slice(0,3000)}\n\`\`\``}] }) })
      const data = await res.json()
      setAiMessages(p=>[...p,{role:'assistant',text:data.choices?.[0]?.message?.content||'No response.'}])
    } catch { setAiMessages(p=>[...p,{role:'assistant',text:'⚠️ Check VITE_GROQ_KEY'}]) }
    setAiLoading(false)
  }

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) return; setInviteSending(true)
    try { await api.post(`/workspaces/${workspaceId}/invite`, { email:inviteEmail, role:inviteRole }); toast.success(`Invite sent to ${inviteEmail}`); setShowInviteModal(false); setInviteEmail('') }
    catch (e) { toast.error(e.response?.data?.error||'Failed to send invite') }
    setInviteSending(false)
  }

  const copyLink = () => { navigator.clipboard.writeText(`${window.location.origin}/workspace/${workspaceId}`); setCopied(true); toast.success('Link copied!'); setTimeout(()=>setCopied(false),2000) }

  // Convert screen coords → canvas world coords
  const toWorld=(e,r)=>({ x:(e.clientX-r.left)/wbScaleRef.current - wbOffsetRef.current.x, y:(e.clientY-r.top)/wbScaleRef.current - wbOffsetRef.current.y })

  const redrawCanvas=()=>{
    const c=canvasRef.current; if(!c) return
    const ctx=c.getContext('2d')
    // Use refs to always get the latest offset/scale — avoids stale closure bug
    const scale = wbScaleRef.current
    const offset = wbOffsetRef.current
    ctx.clearRect(0,0,c.width,c.height)
    ctx.save()
    ctx.scale(scale,scale)
    ctx.translate(offset.x,offset.y)
    strokesRef.current.forEach(s=>{
      if(s.points.length<2) return
      ctx.beginPath(); ctx.strokeStyle=s.color; ctx.lineWidth=s.size; ctx.lineCap='round'; ctx.lineJoin='round'
      if(s.eraser) { ctx.globalCompositeOperation='destination-out'; ctx.lineWidth=s.size*3 }
      else ctx.globalCompositeOperation='source-over'
      ctx.moveTo(s.points[0].x,s.points[0].y)
      s.points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y))
      ctx.stroke()
    })
    ctx.globalCompositeOperation='source-over'
    ctx.restore()
  }

  const startDraw=(e)=>{
    if(e.button===1||(e.button===0&&e.altKey)){ panning.current=true; panStart.current={x:e.clientX-wbOffsetRef.current.x*wbScaleRef.current,y:e.clientY-wbOffsetRef.current.y*wbScaleRef.current}; return }
    drawing.current=true
    const r=canvasRef.current.getBoundingClientRect()
    const wp=toWorld(e,r)
    lastPos.current=wp
    currentStroke.current=[wp]
  }
  const doDraw=(e)=>{
    // Update cursor dot position (screen coords for overlay)
    const r=canvasRef.current.getBoundingClientRect()
    setCursorPos({x: e.clientX - r.left, y: e.clientY - r.top})
    if(panning.current){
      const nx=(e.clientX-panStart.current.x)/wbScaleRef.current, ny=(e.clientY-panStart.current.y)/wbScaleRef.current
      setWbOffset({x:nx,y:ny}); return
    }
    if(!drawing.current||!lastPos.current) return
    const wp=toWorld(e,r)
    currentStroke.current.push(wp)
    // Draw incremental segment on canvas for performance
    const c=canvasRef.current,ctx=c.getContext('2d')
    ctx.save(); ctx.scale(wbScaleRef.current,wbScaleRef.current); ctx.translate(wbOffsetRef.current.x,wbOffsetRef.current.y)
    ctx.strokeStyle=wbMode==='eraser'?'rgba(0,0,0,1)':wbColor
    ctx.lineWidth=wbMode==='eraser'?wbSize*3:wbSize
    ctx.lineCap='round'; ctx.lineJoin='round'
    if(wbMode==='eraser') ctx.globalCompositeOperation='destination-out'
    ctx.beginPath(); ctx.moveTo(lastPos.current.x,lastPos.current.y); ctx.lineTo(wp.x,wp.y); ctx.stroke()
    ctx.restore()
    lastPos.current=wp
  }
  const stopDraw=()=>{
    panning.current=false
    if(!drawing.current) return
    drawing.current=false
    if(currentStroke.current.length>1){
      const stroke = { points:[...currentStroke.current], color:wbColor, size:wbSize, eraser:wbMode==='eraser' }
      strokesRef.current.push(stroke)
      // Broadcast to other users
      emitBoardStroke(workspaceId, stroke)
    }
    currentStroke.current=[]
  }
  const clearCanvas=()=>{
    strokesRef.current=[]
    redrawCanvas()
    emitBoardClear(workspaceId)
  }
  const undoCanvas=()=>{ strokesRef.current.pop(); redrawCanvas() }

  // Zoom with scroll wheel
  const onWbWheel=(e)=>{
    e.preventDefault()
    const factor=e.deltaY<0?1.1:0.9
    setWbScale(s=>Math.min(5,Math.max(0.2,s*factor)))
  }

  // Resize observer: fit canvas to container without losing strokes
  const wbContainerRef = useRef(null)
  useEffect(()=>{
    const el=wbContainerRef.current; if(!el) return
    const obs=new ResizeObserver(()=>{ if(canvasRef.current){ canvasRef.current.width=el.offsetWidth; canvasRef.current.height=el.offsetHeight; redrawCanvas() } })
    obs.observe(el); return ()=>obs.disconnect()
  }, [wbOffset, wbScale])

  const C = { bg:'#0a0a0f',surface:'#111118',border:'#1e1e2e',accent:'#7c6af7',green:'#3dffa0',red:'#ff5370',yellow:'#ffca28',text:'#e2e2f0',muted:'#6e6e8f' }
  const S = {
    tab:(id)=>({ flex:1,background:activePanel===id?`${C.accent}18`:'none',border:'none',borderBottom:activePanel===id?`2px solid ${C.accent}`:'2px solid transparent',color:activePanel===id?C.accent:C.muted,padding:'10px 4px',cursor:'pointer',fontSize:11,fontWeight:700,display:'flex',flexDirection:'column',alignItems:'center',gap:3,fontFamily:'inherit',transition:'all .15s' }),
    btn:(active,danger)=>({ background:danger?'rgba(255,83,112,0.1)':active?`${C.accent}18`:'transparent',border:`1px solid ${danger?'rgba(255,83,112,0.4)':active?`${C.accent}50`:C.border}`,color:danger?C.red:active?C.accent:C.muted,padding:'5px 9px',borderRadius:7,cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:600,display:'inline-flex',alignItems:'center',gap:4,transition:'all .15s' }),
    inp:{ padding:'9px 12px',background:'#16161f',border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontFamily:'inherit',fontSize:13,outline:'none',width:'100%',boxSizing:'border-box' },
  }

  const cameraStream = mediaStreams.find(s=>s.kind==='camera-local')?.stream

  return (
    <div style={{ height:'100vh',display:'flex',flexDirection:'column',background:C.bg,overflow:'hidden',fontFamily:"'Syne',sans-serif",color:C.text }}>

      {/* Topbar */}
      <div style={{ height:48,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',padding:'0 8px',gap:6,flexShrink:0,background:C.surface,overflow:'hidden' }}>
        {/* Mobile: sidebar toggle */}
        {isMobile && (
          <button onClick={()=>setMobileSidebarOpen(o=>!o)} style={{ ...S.btn(mobileSidebarOpen),padding:'5px 8px',flexShrink:0 }}>☰</button>
        )}
        <div style={{ display:'flex',alignItems:'center',gap:6,paddingRight:8,borderRight:`1px solid ${C.border}`,flexShrink:0 }}>
          <div style={{ width:22,height:22,borderRadius:5,background:'linear-gradient(135deg,#7c6af7,#ff7eb3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10 }}>{'<>'}</div>
          {!isMobile && <span style={{ fontWeight:800,fontSize:13 }}>DevSpace</span>}
        </div>
        <span style={{ fontSize:12,fontWeight:700,flexShrink:0,maxWidth:isMobile?90:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{workspace?.name||'Workspace'}</span>
        {!isMobile && <span style={{ fontSize:11,color:C.muted,fontFamily:'monospace' }}>/{workspaceId}</span>}
        <div style={{ display:'flex',alignItems:'center',gap:3,flexShrink:0 }}>
          <div style={{ width:6,height:6,borderRadius:'50%',background:savedStatus==='saved'?C.green:savedStatus==='saving'?C.yellow:C.red }} />
          {!isMobile && <span style={{ fontSize:10,color:savedStatus==='saved'?C.green:C.yellow,fontFamily:'monospace' }}>{savedStatus}</span>}
        </div>
        <div style={{ marginLeft:'auto',display:'flex',alignItems:'center',gap:4,flexShrink:0 }}>
          {/* Online users - fewer on mobile */}
          <div style={{ display:'flex',gap:2,paddingRight:6,borderRight:`1px solid ${C.border}`,alignItems:'center' }}>
            {(onlineUsers||[]).slice(0,isMobile?2:5).map(u=>(
              <div key={u.id} title={u.name} style={{ width:24,height:24,borderRadius:'50%',background:u.avatar_url?'none':`linear-gradient(135deg,${u.color||C.accent}80,${u.color||C.accent})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'#fff',border:`2px solid ${C.surface}`,overflow:'hidden',flexShrink:0 }}>
                {u.avatar_url?<img src={u.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:u.name?.charAt(0).toUpperCase()}
              </div>
            ))}
            <span style={{ fontSize:10,color:C.muted,marginLeft:1,fontFamily:'monospace' }}>{(onlineUsers||[]).length||1}</span>
          </div>
          {/* Mobile: mic + camera + screen + run + leave */}
          {isMobile ? (<>
            <button style={S.btn(micOn)} title={micOn?'Mute':'Unmute'}
              onClick={async()=>{ if(micOn){stopVoiceChat();toast.info('Mic off')}else{try{await startVoiceChat();toast.success('🎙️ On')}catch(e){toast.error('Mic: '+e.message)}} }}>
              {micOn?'🔴':'🎙️'}
            </button>
            <button style={S.btn(cameraOn)} title={cameraOn?'Camera off':'Camera on'}
              onClick={async()=>{ if(cameraOn){stopCameraShare();toast.info('Camera off')}else{try{await startCameraShare();toast.success('📷 On')}catch(e){toast.error('Cam: '+e.message)}} }}>
              {cameraOn?'📷':'📷'}
            </button>
            <button style={S.btn(screenOn)} title={screenOn?'Stop sharing':'Share screen'}
              onClick={async()=>{ if(screenOn){stopScreenShare();toast.info('Stopped')}else{try{await startScreenShare();toast.success('🖥️ Sharing')}catch(e){if(e.name!=='NotAllowedError')toast.error(e.message)}} }}>
              🖥️
            </button>
            <button style={S.btn(false)} onClick={handleRunCode}>▶</button>
            <button onClick={()=>navigate('/dashboard')} style={S.btn(false,true)}>✕</button>
          </>) : (<>
            <button style={S.btn(micOn)} onClick={async()=>{ if(micOn){stopVoiceChat();toast.info('Mic off')} else{try{await startVoiceChat();toast.success('🎙️ Voice on')}catch(e){toast.error('Mic: '+e.message)}} }}>🎙️ {micOn?'Live':'Mic'}</button>
            <button style={S.btn(cameraOn)} onClick={async()=>{ if(cameraOn){stopCameraShare();toast.info('Camera off')} else{try{await startCameraShare();toast.success('📷 Camera on')}catch(e){toast.error('Camera: '+e.message)}} }}>📷 {cameraOn?'On':'Cam'}</button>
            {cameraOn && <button style={S.btn(false)} onClick={()=>setShowCameraEffects(true)} title="Camera effects">✨</button>}
            <button style={S.btn(screenOn)} onClick={async()=>{ if(screenOn){stopScreenShare();toast.info('Share stopped')} else{try{await startScreenShare();toast.success('🖥️ Sharing')}catch(e){if(e.name!=='NotAllowedError')toast.error(e.message)}} }}>🖥️ {screenOn?'Stop':'Share'}</button>
            <button style={S.btn(false)} onClick={handleRunCode}>▶ Run</button>
            <button style={S.btn(showVersions)} onClick={()=>{ setShowVersions(true); dispatch(fetchVersions({workspaceId,fileId:activeFileId})) }}>🔀 Ver</button>
            <button style={S.btn(false)} onClick={()=>setShowInviteModal(true)}>✉️</button>
            <button style={S.btn(copied)} onClick={copyLink}>{copied?'✓ Copied':'🔗 Share'}</button>
            <button onClick={()=>navigate('/dashboard')} style={S.btn(false,true)}>Leave ↗</button>
          </>)}
        </div>
      </div>

      {/* Body */}
      <div ref={bodyRef} style={{ flex:1,display:'flex',overflow:'hidden',position:'relative' }}>
        {/* Mobile overlay backdrop — only for sidebar drawer */}
        {isMobile && mobileSidebarOpen && (
          <div onClick={()=>setMobileSidebarOpen(false)}
            style={{ position:'absolute',inset:0,background:'rgba(0,0,0,0.6)',zIndex:30 }} />
        )}

        {/* Sidebar */}
        <div style={{
          width: isMobile ? 240 : sidebarW,
          borderRight:`1px solid ${C.border}`,
          display:'flex',flexDirection:'column',background:C.surface,flexShrink:0,
          ...(isMobile ? {
            position:'absolute', top:0, left:0, bottom:0, zIndex:40,
            transform: mobileSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition:'transform 0.25s ease',
            boxShadow: mobileSidebarOpen ? '4px 0 24px rgba(0,0,0,0.5)' : 'none',
          } : {}),
        }}>
          <div style={{ padding:'8px 10px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
            <span style={{ fontSize:10,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.5px' }}>Explorer</span>
            <div style={{ display:'flex',gap:4 }}>
              <button onClick={()=>{setAddingItem('file');setNewItemName('')}} title="New file" style={{ background:'none',border:'none',color:C.accent,cursor:'pointer',fontSize:18,padding:'0 2px',lineHeight:1 }}>+</button>
              <button onClick={()=>{setAddingItem('folder');setNewItemName('')}} title="New folder" style={{ background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:13,padding:'0 3px',lineHeight:1.4 }}>📁</button>
            </div>
          </div>

          {addingItem && (
            <div style={{ padding:'6px 8px',borderBottom:`1px solid ${C.border}`,background:'#16161f' }}>
              <div style={{ fontSize:10,color:C.muted,marginBottom:4 }}>{addingItem==='folder'?'📁 New folder':'📄 New file'}</div>
              <input style={{ ...S.inp,fontSize:12,padding:'5px 8px' }} placeholder={addingItem==='folder'?'folder-name':'file.js'} value={newItemName} autoFocus
                onChange={e=>setNewItemName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleAddItem();if(e.key==='Escape'){setAddingItem(null);setNewItemName('')}}} />
              <div style={{ display:'flex',gap:4,marginTop:5 }}>
                <button onClick={handleAddItem} style={{ flex:1,padding:'3px',borderRadius:4,background:C.accent,border:'none',color:'#fff',fontSize:10,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>Create</button>
                <button onClick={()=>{setAddingItem(null);setNewItemName('')}} style={{ flex:1,padding:'3px',borderRadius:4,background:'transparent',border:`1px solid ${C.border}`,color:C.muted,fontSize:10,cursor:'pointer',fontFamily:'inherit' }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ flex:1,overflowY:'auto',padding:'4px 0' }}>
            {localFiles.length===0 && <div style={{ padding:'20px 10px',textAlign:'center',color:'#3a3a55',fontSize:11 }}>No files yet</div>}

            {fileTree.folders.map(folder => (
              <FolderRow key={folder.id} folder={folder} isOpen={openFolders[folder.folderName]} onToggle={()=>setOpenFolders(o=>({...o,[folder.folderName]:!o[folder.folderName]}))} onRename={f=>setRenameItem({item:f,isFolder:true})} onDelete={f=>setDeleteConfirm(f)} workspaceId={workspaceId}>
                {folder.children.map(f=><FileRow key={f.id} file={f} isActive={f.id===activeFileId} onSelect={()=>{dispatch(setActiveFile(f));if(isMobile)setMobileSidebarOpen(false)}} onRename={f=>setRenameItem({item:f,isFolder:false})} onDelete={f=>setDeleteConfirm(f)} workspaceId={workspaceId} indent={1} />)}
              </FolderRow>
            ))}
            {fileTree.rootFiles.map(f=><FileRow key={f.id} file={f} isActive={f.id===activeFileId} onSelect={()=>{dispatch(setActiveFile(f));if(isMobile)setMobileSidebarOpen(false)}} onRename={f=>setRenameItem({item:f,isFolder:false})} onDelete={f=>setDeleteConfirm(f)} workspaceId={workspaceId} />)}
          </div>

          <div style={{ padding:'8px 12px',borderTop:`1px solid ${C.border}` }}>
            {[{l:'Files',v:localFiles.filter(f=>!f.name.endsWith('/.folder')).length,c:C.yellow},{l:'Online',v:(onlineUsers||[]).length||1,c:C.green}].map(s=>(
              <div key={s.l} style={{ display:'flex',justifyContent:'space-between',marginBottom:2 }}>
                <span style={{ fontSize:10,color:C.muted }}>{s.l}</span>
                <span style={{ fontSize:10,fontWeight:700,color:s.c,fontFamily:'monospace' }}>{s.v}</span>
              </div>
            ))}
          </div>
        </div>

        <DragHandle onDrag={handleSidebarDrag} />

        {/* Editor */}
        <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
          <div style={{ height:34,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',background:C.surface,overflowX:'auto' }}>
            {localFiles.filter(f=>!f.name.endsWith('/.folder')).map(f=>{
              const active=f.id===activeFileId; const ext=f.name.split('.').pop()
              return (
                <div key={f.id} onClick={()=>dispatch(setActiveFile(f))} style={{ display:'flex',alignItems:'center',gap:6,padding:'0 12px',height:'100%',cursor:'pointer',flexShrink:0,borderRight:`1px solid ${C.border}`,background:active?C.bg:'transparent',borderBottom:active?`2px solid ${C.accent}`:'2px solid transparent' }}>
                  <FileIcon ext={ext} />
                  <span style={{ fontSize:11,color:active?C.text:C.muted,fontFamily:'monospace' }}>{f.name.split('/').pop()}</span>
                </div>
              )
            })}
          </div>

          <div style={{ flex:1,overflow:'hidden',position:'relative' }}>
            {/* Live cursor name tags */}
            {Object.entries(cursors||{}).filter(([uid])=>uid!==user?.id).map(([uid,cur])=>{
              if(!cur.line) return null
              const lineH=19,charW=7.65,gutterW=62
              const curUser=(onlineUsers||[]).find(u=>u.id===uid)
              const color=curUser?.color||C.accent
              return (
                <div key={uid} style={{ position:'absolute',zIndex:10,pointerEvents:'none',top:(cur.line-1)*lineH+8,left:Math.max(gutterW,(cur.col-1)*charW+gutterW),transition:'top .08s,left .08s' }}>
                  <div style={{ width:2,height:18,background:color,borderRadius:1 }} />
                  <div style={{ position:'absolute',top:-20,left:-1,background:color,color:'#000',padding:'2px 7px',borderRadius:'4px 4px 4px 0',fontSize:10,fontWeight:700,whiteSpace:'nowrap',boxShadow:`0 2px 8px ${color}50` }}>{cur.name||curUser?.name||'User'}</div>
                </div>
              )
            })}
            <MonacoEditor height="100%" language={language} value={code} theme="vs-dark" onChange={handleCodeChange} onMount={handleEditorMount}
              options={{ fontSize:13.5,fontFamily:"'JetBrains Mono','Fira Code',monospace",fontLigatures:true,lineHeight:22,minimap:{enabled:false},scrollBeyondLastLine:false,smoothScrolling:true,cursorBlinking:'smooth',padding:{top:16},tabSize:2,wordWrap:'on',bracketPairColorization:{enabled:true} }} />
          </div>

          {typingUsers?.length>0 && (
            <div style={{ height:24,padding:'0 14px',display:'flex',alignItems:'center',borderTop:`1px solid ${C.border}`,background:C.surface }}>
              <span style={{ fontSize:10,color:C.muted }}>{typingUsers.map(u=>u.name).join(', ')} typing...</span>
            </div>
          )}
        </div>

        {!isMobile && <DragHandle onDrag={handleRightDrag} />}

        {/* Right panel — desktop: sidebar, mobile: full-screen modal */}
        {(!isMobile || mobilePanelOpen) && (
        <div style={{
          width: isMobile ? '100vw' : rightW,
          borderLeft: isMobile ? 'none' : `1px solid ${C.border}`,
          display:'flex',flexDirection:'column',flexShrink:0,
          ...(isMobile ? {
            position:'fixed',
            top: 0, left: 0, right: 0,
            bottom: 56,          // leave space for bottom nav bar
            zIndex: 60,
            background: C.bg,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          } : {}),
        }}>
          {/* Tab bar — desktop only (mobile uses bottom nav) */}
          {!isMobile && (
          <div style={{ display:'flex',borderBottom:`1px solid ${C.border}`,background:C.surface }}>
            {[{id:'chat',e:'💬',l:'Chat'},{id:'terminal',e:'⌨️',l:'Term'},{id:'ai',e:'✨',l:'AI'},{id:'whiteboard',e:'🎨',l:'Board'}].map(p=>(
              <button key={p.id} style={S.tab(p.id)} onClick={()=>dispatch(setActivePanel(p.id))}><span>{p.e}</span><span>{p.l}</span></button>
            ))}
          </div>
          )}
          {/* Mobile header bar with title + close */}
          {isMobile && (
          <div style={{ height:48,display:'flex',alignItems:'center',padding:'0 14px',borderBottom:`1px solid ${C.border}`,background:C.surface,flexShrink:0 }}>
            <span style={{ fontWeight:700,fontSize:14 }}>
              {activePanel==='chat'?'💬 Chat':activePanel==='terminal'?'⌨️ Terminal':activePanel==='ai'?'✨ AI Assistant':'🎨 Whiteboard'}
            </span>
            <button onClick={()=>setMobilePanelOpen(false)}
              style={{ marginLeft:'auto',width:32,height:32,borderRadius:8,background:'transparent',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center' }}>
              ✕
            </button>
          </div>
          )}

          {/* Chat */}
          {activePanel==='chat' && (
            <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minHeight:0 }}>
              <div style={{ flex:1,overflowY:'auto',padding:'10px',display:'flex',flexDirection:'column',gap:8,minHeight:0 }}>
                {(messages||[]).length===0 && <div style={{ textAlign:'center',color:'#3a3a55',fontSize:12,marginTop:40 }}>No messages yet 👋</div>}
                {(messages||[]).map((msg,i)=>{
                  const isMe=msg.user?.id===user?.id
                  return (
                    <div key={msg.id||i} style={{ display:'flex',gap:7,flexDirection:isMe?'row-reverse':'row',alignItems:'flex-start' }}>
                      <div style={{ width:26,height:26,borderRadius:'50%',background:msg.user?.avatar_url?'none':`linear-gradient(135deg,${msg.user?.color||C.accent}80,${msg.user?.color||C.accent})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff',flexShrink:0,overflow:'hidden' }}>
                        {msg.user?.avatar_url?<img src={msg.user.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:msg.user?.name?.charAt(0).toUpperCase()||'?'}
                      </div>
                      <div style={{ maxWidth:'80%' }}>
                        {!isMe && <div style={{ fontSize:10,color:msg.user?.color||C.accent,fontWeight:700,marginBottom:2 }}>{msg.user?.name}</div>}
                        <div style={{ background:isMe?C.accent:'#16161f',border:`1px solid ${isMe?`${C.accent}40`:C.border}`,padding:'7px 11px',borderRadius:isMe?'10px 10px 2px 10px':'10px 10px 10px 2px',fontSize:12,lineHeight:1.5,color:isMe?'#fff':C.text,wordBreak:'break-word' }}>{msg.message||msg.text}</div>
                        <div style={{ fontSize:9,color:'#3a3a55',marginTop:2,textAlign:isMe?'right':'left' }}>{msg.time||''}</div>
                      </div>
                    </div>
                  )
                })}
                <div ref={chatEndRef} />
              </div>
              <div style={{ padding:'8px 10px',borderTop:`1px solid ${C.border}`,display:'flex',gap:7,flexShrink:0,background:C.bg,alignItems:'center' }}>
                <input style={{ ...S.inp,flex:1,fontSize:16,minWidth:0 }} placeholder="Message..." value={newMsg}
                  onChange={e=>setNewMsg(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&sendMessage()} />
                <button onClick={sendMessage} style={{ padding:'9px 16px',borderRadius:8,background:C.accent,color:'#fff',border:'none',cursor:'pointer',fontSize:15,flexShrink:0,fontWeight:700 }}>↑</button>
              </div>
            </div>
          )}

          {/* Terminal + Preview */}
          {activePanel==='terminal' && (
            <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:'#0d1117' }}>

              {/* Tab bar: Terminal / Preview */}
              <div style={{ display:'flex',borderBottom:'1px solid #1a1a2e',flexShrink:0 }}>
                <button onClick={()=>setShowPreview(false)} style={{ flex:1,padding:'7px',background:!showPreview?'#0d1117':'transparent',border:'none',borderBottom:!showPreview?`2px solid ${C.accent}`:'2px solid transparent',color:!showPreview?C.accent:C.muted,cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:700 }}>⌨️ Terminal</button>
                <button onClick={()=>setShowPreview(true)} style={{ flex:1,padding:'7px',background:showPreview?'#0d1117':'transparent',border:'none',borderBottom:showPreview?`2px solid ${C.accent}`:'2px solid transparent',color:showPreview?C.accent:C.muted,cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:700 }}>🌐 Preview</button>
              </div>

              {/* ── PREVIEW TAB ── */}
              {showPreview && (
                <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
                  <div style={{ padding:'5px 10px',borderBottom:'1px solid #1a1a2e',display:'flex',alignItems:'center',gap:8,flexShrink:0 }}>
                    <span style={{ fontSize:10,color:C.muted }}>Live preview · {language}</span>
                    <button onClick={()=>setShowPreview(false)} style={{ marginLeft:'auto',padding:'2px 8px',borderRadius:5,background:'transparent',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',fontSize:10,fontFamily:'inherit' }}>← Terminal</button>
                  </div>
                  <iframe
                    key={code}
                    srcDoc={
                      ['react','react-ts','jsx','tsx'].includes(language)
                        ? `<!DOCTYPE html><html><head>
                            <meta charset="UTF-8"/>
                            <script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
                            <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
                            <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
                            <style>*{box-sizing:border-box}body{margin:0;background:#fff;font-family:sans-serif}</style>
                          </head><body>
                            <div id="root"></div>
                            <script type="text/babel">
                              ${code.replace(/export\s+default\s+/g, 'window.__DevSpaceComp__ = ')}
                              const Root = window.__DevSpaceComp__ || (typeof App !== 'undefined' ? App : () => React.createElement('p',null,'Name your component "App" or use export default'))
                              ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Root))
                            <\/script>
                          </body></html>`
                        : code
                    }
                    style={{ flex:1,border:'none',background:'#fff' }}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
                    title="preview"
                  />
                </div>
              )}

              {/* ── TERMINAL TAB ── */}
              {!showPreview && (
                <>
                  {/* Output area */}
                  <div
                    style={{ flex:1,overflowY:'auto',padding:'10px 14px',fontFamily:"'JetBrains Mono','Fira Code',monospace",fontSize:12,lineHeight:1.8,cursor:'text' }}
                    onClick={()=>termInputRef.current?.focus()}
                  >
                    <div style={{ color:'#3a3a55',marginBottom:4,fontSize:11 }}>DevSpace Shell · {workspaceId} · type commands below ↓</div>
                    {termLines.map((l,i)=>(
                      <div key={i} style={{ color: l.type==='result'?C.green : l.type==='error'?C.red : l.type==='warn'?C.yellow : l.type==='cmd'?'#e2e2f0' : l.type==='info'?'#89ddff' : '#3a3a55', marginBottom:1, whiteSpace:'pre-wrap', wordBreak:'break-all' }}>
                        {l.type==='error'&&<span style={{color:C.red}}>✗ </span>}
                        {l.type==='result'&&<span style={{color:C.muted}}>▸ </span>}
                        {l.text}
                      </div>
                    ))}
                    {executionLoading && (
                      <div style={{ color:C.yellow,display:'flex',alignItems:'center',gap:8 }}>
                        <div style={{ width:9,height:9,borderRadius:'50%',border:'2px solid rgba(255,202,40,0.3)',borderTopColor:C.yellow,animation:'spin 0.7s linear infinite' }} />
                        Running...
                      </div>
                    )}
                    <div ref={termEndRef} />
                  </div>

                  {/* Prompt input row */}
                  <div style={{ borderTop:'1px solid #1a1a2e',padding:'6px 10px',display:'flex',alignItems:'center',gap:6,flexShrink:0,background:'#0a0a0f' }}>
                    <span style={{ color:C.green,fontFamily:'monospace',fontSize:12,userSelect:'none',flexShrink:0 }}>devspace</span>
                    <span style={{ color:C.accent,fontFamily:'monospace',fontSize:12,userSelect:'none',flexShrink:0 }}>:~$</span>
                    <input
                      ref={termInputRef}
                      value={termInput}
                      onChange={e=>setTermInput(e.target.value)}
                      onKeyDown={handleTermSubmit}
                      placeholder="node -v  |  npm install vite  |  python3 --version ..."
                      style={{ flex:1,background:'transparent',border:'none',outline:'none',color:'#e2e2f0',fontFamily:"'JetBrains Mono',monospace",fontSize:12,caretColor:C.accent }}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>

                  {/* Bottom action bar */}
                  <div style={{ padding:'5px 8px',borderTop:'1px solid #1a1a2e',display:'flex',gap:6,flexShrink:0 }}>
                    <button onClick={handleRunCode} style={{ flex:1,padding:'6px',borderRadius:6,background:`${C.green}12`,border:`1px solid ${C.green}30`,color:C.green,cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:700 }}>▶ Run {language}</button>
                    <button onClick={()=>{ setTermLines([{ text:'Terminal cleared.', type:'muted' }]); dispatch(clearExecutionOutput()) }} style={{ padding:'6px 10px',borderRadius:6,background:'transparent',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',fontFamily:'inherit',fontSize:11 }}>Clear</button>
                    {['html','tailwind'].includes(language) && (
                      <button onClick={()=>setShowPreview(true)} style={{ padding:'6px 10px',borderRadius:6,background:`${C.blue}12`,border:`1px solid ${C.blue}30`,color:C.blue,cursor:'pointer',fontFamily:'inherit',fontSize:11 }}>🌐 Preview</button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* AI */}
          {activePanel==='ai' && (
            <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
              <div style={{ padding:'8px 12px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:7 }}>
                <span>✨</span><span style={{ fontSize:12,fontWeight:700 }}>AI Assistant</span>
                <span style={{ marginLeft:'auto',padding:'1px 6px',borderRadius:4,fontSize:10,fontWeight:700,background:`${C.green}12`,color:C.green,border:`1px solid ${C.green}25` }}>Llama 3.3</span>
              </div>
              <div style={{ flex:1,overflowY:'auto',padding:'10px',display:'flex',flexDirection:'column',gap:8 }}>
                {aiMessages.map((msg,i)=><div key={i} style={{ background:msg.role==='user'?`${C.accent}12`:'#16161f',border:`1px solid ${msg.role==='user'?`${C.accent}30`:C.border}`,padding:'10px',borderRadius:9,fontSize:12,lineHeight:1.6,whiteSpace:'pre-wrap',wordBreak:'break-word' }}><div style={{ fontSize:10,color:msg.role==='assistant'?C.accent:C.muted,fontWeight:700,marginBottom:4 }}>{msg.role==='assistant'?'✦ AI':'You'}</div>{msg.text}</div>)}
                {aiLoading && <div style={{ background:'#16161f',border:`1px solid ${C.border}`,padding:'10px',borderRadius:9,color:C.accent,fontSize:12 }}>Thinking...</div>}
              </div>
              <div style={{ padding:'8px 10px',borderTop:`1px solid ${C.border}`,paddingBottom: isMobile ? 12 : 8 }}>
                <textarea style={{ ...S.inp,minHeight:60,resize:'vertical',marginBottom:7,fontSize:12 }} placeholder="Ask about the code... (Enter to send)" value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleAskAI()}}} />
                <button onClick={handleAskAI} disabled={aiLoading||!aiInput.trim()} style={{ width:'100%',padding:'9px',borderRadius:7,background:C.accent,color:'#fff',border:'none',fontFamily:'inherit',fontSize:12,fontWeight:700,cursor:aiLoading?'not-allowed':'pointer',opacity:aiLoading?0.7:1 }}>{aiLoading?'✦ Thinking...':'✨ Ask AI (Enter)'}</button>
              </div>
            </div>
          )}

          {/* Whiteboard — infinite canvas + fullscreen + shared */}
          {activePanel==='whiteboard' && (
            <div style={{
              flex:1,display:'flex',flexDirection:'column',overflow:'hidden',
              ...(wbFullscreen ? { position:'fixed',inset:0,zIndex:200,background:'#0d0d14' } : {}),
            }}>
              {/* Toolbar */}
              <div style={{ borderBottom:`1px solid ${C.border}`,flexShrink:0,background:C.surface }}>
                {/* Row 1: tools + color swatches + actions */}
                <div style={{ padding:'5px 8px',display:'flex',gap:4,alignItems:'center',flexWrap:'wrap' }}>
                  <button onClick={()=>setWbMode('pen')} style={{ ...S.btn(wbMode==='pen'),fontSize:10,padding:'4px 8px' }}>✏️ Pen</button>
                  <button onClick={()=>setWbMode('eraser')} style={{ ...S.btn(wbMode==='eraser'),fontSize:10,padding:'4px 8px' }}>🧹 Erase</button>
                  <div style={{ width:1,height:16,background:C.border,margin:'0 2px',flexShrink:0 }}/>
                  {/* Quick swatches */}
                  {['#7c6af7','#3dffa0','#ff5370','#ffca28','#89ddff','#ff7eb3','#ffffff','#000000'].map(c=>(
                    <button key={c} onClick={()=>{setWbMode('pen');setWbColor(c);setShowColorPicker(false)}}
                      style={{ width:20,height:20,borderRadius:'50%',background:c,
                        border: wbColor===c&&wbMode==='pen' ? '2px solid #fff' : '2px solid rgba(255,255,255,0.15)',
                        cursor:'pointer',flexShrink:0,padding:0,boxShadow:wbColor===c&&wbMode==='pen'?`0 0 0 2px ${C.accent}`:'none',
                        transition:'box-shadow .15s' }}/>
                  ))}
                  {/* Custom color picker */}
                  <div style={{ position:'relative',flexShrink:0 }}>
                    <button onClick={()=>setShowColorPicker(v=>!v)}
                      title="Custom color"
                      style={{ width:24,height:24,borderRadius:6,background:`conic-gradient(red,yellow,lime,cyan,blue,magenta,red)`,
                        border: showColorPicker?`2px solid ${C.accent}`:'2px solid rgba(255,255,255,0.2)',
                        cursor:'pointer',padding:0,flexShrink:0 }} />
                    {showColorPicker && (
                      <div onClick={e=>e.stopPropagation()} style={{ position:'absolute',top:'calc(100% + 6px)',left:0,zIndex:300,
                        background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:12,
                        boxShadow:'0 8px 32px rgba(0,0,0,0.6)',minWidth:200 }}>
                        <div style={{ fontSize:10,color:C.muted,marginBottom:8,fontWeight:700 }}>CUSTOM COLOR</div>
                        {/* Hue rows */}
                        {[
                          ['#ff0000','#ff4400','#ff8800','#ffaa00','#ffcc00','#ffff00'],
                          ['#88ff00','#00ff00','#00ff88','#00ffcc','#00ffff','#00ccff'],
                          ['#0088ff','#0044ff','#4400ff','#8800ff','#cc00ff','#ff00ff'],
                          ['#ff0088','#ffffff','#cccccc','#888888','#444444','#000000'],
                          ['#7c6af7','#3dffa0','#ff5370','#ffca28','#89ddff','#ff7eb3'],
                        ].map((row,i)=>(
                          <div key={i} style={{ display:'flex',gap:5,marginBottom:5 }}>
                            {row.map(c=>(
                              <button key={c} onClick={()=>{setWbColor(c);setWbMode('pen');setShowColorPicker(false)}}
                                style={{ width:24,height:24,borderRadius:5,background:c,border:wbColor===c?`2px solid #fff`:'2px solid transparent',cursor:'pointer',padding:0,flexShrink:0 }}/>
                            ))}
                          </div>
                        ))}
                        {/* Hex input */}
                        <div style={{ display:'flex',gap:6,marginTop:4,alignItems:'center' }}>
                          <div style={{ width:24,height:24,borderRadius:5,background:wbColor,flexShrink:0,border:'1px solid rgba(255,255,255,0.2)' }}/>
                          <input value={wbColor} onChange={e=>{ if(/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setWbColor(e.target.value) }}
                            style={{ flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,padding:'4px 8px',fontSize:12,fontFamily:'monospace',outline:'none' }}/>
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ marginLeft:'auto',display:'flex',gap:4,alignItems:'center' }}>
                    <button onClick={undoCanvas} style={{ ...S.btn(false),fontSize:10,padding:'4px 8px' }} title="Undo">↩</button>
                    <button onClick={clearCanvas} style={{ ...S.btn(false),fontSize:10,padding:'4px 8px',color:C.red }} title="Clear all">🗑</button>
                    <button onClick={()=>setWbFullscreen(f=>!f)} title={wbFullscreen?'Exit fullscreen':'Fullscreen'}
                      style={{ ...S.btn(wbFullscreen),fontSize:13,padding:'4px 8px' }}>
                      {wbFullscreen ? '⊠' : '⛶'}
                    </button>
                  </div>
                </div>
                {/* Row 2: brush size + zoom */}
                <div style={{ padding:'3px 8px 5px',display:'flex',gap:6,alignItems:'center',borderTop:`1px solid ${C.border}` }}>
                  {/* Brush dot preview */}
                  <div style={{ width:Math.min(wbSize,20)+4,height:Math.min(wbSize,20)+4,borderRadius:'50%',
                    background:wbMode==='eraser'?'rgba(255,255,255,0.3)':wbColor,flexShrink:0,
                    border:'1px solid rgba(255,255,255,0.2)',transition:'all .1s' }}/>
                  <input type="range" min={1} max={50} value={wbSize} onChange={e=>setWbSize(+e.target.value)}
                    style={{ flex:1,maxWidth:100,cursor:'pointer',accentColor:C.accent }} />
                  <span style={{ fontSize:10,color:C.muted,minWidth:18,textAlign:'right',fontFamily:'monospace' }}>{wbSize}px</span>
                  <div style={{ width:1,height:14,background:C.border,margin:'0 4px' }}/>
                  <button onClick={()=>setWbScale(s=>{const v=Math.min(5,+(s*1.2).toFixed(2));wbScaleRef.current=v;return v})} style={{ ...S.btn(false),fontSize:11,padding:'2px 7px' }}>+</button>
                  <span style={{ fontSize:9,color:C.muted,minWidth:32,textAlign:'center',fontFamily:'monospace' }}>{Math.round(wbScale*100)}%</span>
                  <button onClick={()=>setWbScale(s=>{const v=Math.max(0.2,+(s/1.2).toFixed(2));wbScaleRef.current=v;return v})} style={{ ...S.btn(false),fontSize:11,padding:'2px 7px' }}>−</button>
                  <button onClick={()=>{wbScaleRef.current=1;wbOffsetRef.current={x:0,y:0};setWbScale(1);setWbOffset({x:0,y:0});setTimeout(redrawCanvas,0)}} style={{ ...S.btn(false),fontSize:9,padding:'2px 6px' }}>↺</button>
                  <span style={{ fontSize:9,color:'#3a3a55',marginLeft:'auto',display:isMobile?'none':'block' }}>Alt+drag·scroll zoom</span>
                </div>
              </div>

              {/* Canvas area */}
              <div ref={wbContainerRef} style={{ flex:1,position:'relative',overflow:'hidden',background:'#0d0d14',cursor:'none' }}
                onClick={()=>showColorPicker&&setShowColorPicker(false)}>
                <canvas ref={canvasRef}
                  style={{ position:'absolute',top:0,left:0,cursor:'none',touchAction:'none' }}
                  onMouseDown={startDraw} onMouseMove={doDraw} onMouseUp={stopDraw}
                  onMouseLeave={()=>{stopDraw();setCursorPos({x:-100,y:-100})}}
                  onTouchStart={e=>{e.preventDefault();const t=e.touches[0];startDraw({clientX:t.clientX,clientY:t.clientY,button:0})}}
                  onTouchMove={e=>{e.preventDefault();const t=e.touches[0];doDraw({clientX:t.clientX,clientY:t.clientY})}}
                  onTouchEnd={stopDraw}
                  onWheel={onWbWheel}
                />
                {/* Custom cursor dot */}
                <div style={{
                  position:'absolute',
                  pointerEvents:'none',
                  zIndex:10,
                  left: cursorPos.x,
                  top: cursorPos.y,
                  width: wbMode==='eraser' ? wbSize*3 : wbSize,
                  height: wbMode==='eraser' ? wbSize*3 : wbSize,
                  borderRadius:'50%',
                  background: wbMode==='eraser' ? 'rgba(255,255,255,0.15)' : wbColor,
                  border: wbMode==='eraser' ? '2px solid rgba(255,255,255,0.5)' : '1.5px solid rgba(255,255,255,0.5)',
                  transform:'translate(-50%,-50%)',
                  transition:'width .05s,height .05s',
                  mixBlendMode: wbMode==='eraser' ? 'difference' : 'normal',
                  opacity: cursorPos.x < 0 ? 0 : 1,
                }}/>
                {wbFullscreen && (
                  <button onClick={()=>setWbFullscreen(false)}
                    style={{ position:'absolute',top:10,right:10,padding:'6px 12px',borderRadius:7,
                      background:'rgba(0,0,0,0.7)',border:`1px solid ${C.border}`,color:C.muted,
                      cursor:'pointer',fontSize:11,fontFamily:'inherit' }}>
                    ✕ Exit fullscreen
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Mobile bottom nav */}
      {isMobile && (
        <div style={{ position:'fixed',bottom:0,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,display:'flex',zIndex:70,paddingBottom:'env(safe-area-inset-bottom)' }}>
          {[
            { icon:'📁', label:'Files', action:()=>{ setMobilePanelOpen(false); setMobileSidebarOpen(o=>!o) }, active: mobileSidebarOpen && !mobilePanelOpen },
            { icon:'💬', label:'Chat',  action:()=>{ setMobileSidebarOpen(false); dispatch(setActivePanel('chat')); setMobilePanelOpen(true) }, active: mobilePanelOpen && activePanel==='chat' },
            { icon:'▶',  label:'Run',   action: handleRunCode, active: false, green: true },
            { icon:'⌨️', label:'Term',  action:()=>{ setMobileSidebarOpen(false); dispatch(setActivePanel('terminal')); setMobilePanelOpen(true) }, active: mobilePanelOpen && activePanel==='terminal' },
            { icon:'🎨', label:'Board', action:()=>{ setMobileSidebarOpen(false); dispatch(setActivePanel('whiteboard')); setMobilePanelOpen(true) }, active: mobilePanelOpen && activePanel==='whiteboard' },
          ].map(({icon,label,action,active,green})=>(
            <button key={label} onClick={action} style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2,background:'none',border:'none',borderTop: active ? `2px solid ${C.accent}` : '2px solid transparent',color: green ? C.green : active ? C.accent : C.muted,cursor:'pointer',padding:'8px 0 6px',fontFamily:'inherit',transition:'color .15s' }}>
              <span style={{fontSize:17,lineHeight:1}}>{icon}</span>
              <span style={{fontSize:9,fontWeight:700,letterSpacing:'0.3px'}}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Floating media */}
      {mediaStreams.length>0 && mediaWindowOpen && <FloatingMedia streams={mediaStreams} onClose={()=>setMediaWindowOpen(false)} onStopAll={()=>{stopScreenShare();stopCameraShare();setMediaStreams([]);setMediaWindowOpen(false)}} />}
      {/* Reopen button when window is dismissed but streams are still active */}
      {mediaStreams.length>0 && !mediaWindowOpen && (
        <button onClick={()=>setMediaWindowOpen(true)} style={{ position:'fixed',bottom: isMobile ? 68 : 20,right:20,zIndex:9990,background:'#7c6af7',border:'none',borderRadius:10,color:'#fff',padding:'8px 14px',fontSize:12,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 20px rgba(124,106,247,0.5)',display:'flex',alignItems:'center',gap:6 }}>
          📺 Show streams ({mediaStreams.length})
        </button>
      )}

      {/* Camera effects */}
      {showCameraEffects && cameraStream && <CameraEffects stream={cameraStream} onClose={()=>setShowCameraEffects(false)} />}

      {/* Rename file/folder */}
      {renameItem && <RenameFileModal item={renameItem.item} isFolder={renameItem.isFolder} onClose={()=>setRenameItem(null)} onRenamed={handleFileRenamed} />}

      {/* Delete confirm */}
      {deleteConfirm && (
        <Modal onClose={()=>setDeleteConfirm(null)}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:32,marginBottom:10 }}>🗑️</div>
            <h3 style={{ fontSize:15,fontWeight:700,marginBottom:6 }}>Delete "{deleteConfirm.name?.split('/').pop()}"?</h3>
            <p style={{ color:C.muted,fontSize:12,marginBottom:20 }}>This will be permanently deleted.</p>
            <div style={{ display:'flex',gap:8,justifyContent:'center' }}>
              <button onClick={()=>handleDeleteItem(deleteConfirm)} style={{ padding:'9px 22px',borderRadius:7,background:C.red,border:'none',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit' }}>Delete</button>
              <button onClick={()=>setDeleteConfirm(null)} style={{ padding:'9px 18px',borderRadius:7,background:'transparent',border:`1px solid ${C.border}`,color:C.text,fontSize:12,cursor:'pointer',fontFamily:'inherit' }}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Version history */}
      {showVersions && (
        <Modal onClose={()=>setShowVersions(false)} width={460}>
          <div style={{ display:'flex',justifyContent:'space-between',marginBottom:16 }}>
            <h3 style={{ fontSize:15,fontWeight:700 }}>🔀 Version History</h3>
            <button onClick={()=>setShowVersions(false)} style={{ background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:16 }}>✕</button>
          </div>
          {(versions||[]).length===0 ? <p style={{ color:C.muted,textAlign:'center',padding:'16px 0',fontSize:13 }}>No saved versions yet.</p>
            : versions.map((v,i)=>(
              <div key={v.id} style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:i<versions.length-1?`1px solid ${C.border}`:'none' }}>
                <div style={{ flex:1 }}><div style={{ fontSize:13,fontWeight:600 }}>{v.message||`Version ${v.version_num}`}</div><div style={{ fontSize:11,color:C.muted }}>{new Date(v.created_at).toLocaleString()}</div></div>
                <button onClick={async()=>{ await dispatch(restoreVersion({workspaceId,fileId:activeFileId,versionId:v.id})).unwrap(); setShowVersions(false); toast.success('Restored!') }} style={{ padding:'4px 11px',borderRadius:6,background:`${C.accent}15`,border:`1px solid ${C.accent}30`,color:C.accent,cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:600 }}>Restore</button>
              </div>
            ))
          }
        </Modal>
      )}

      {/* Invite */}
      {showInviteModal && (
        <Modal onClose={()=>setShowInviteModal(false)} width={400}>
          <div style={{ display:'flex',justifyContent:'space-between',marginBottom:18 }}>
            <h3 style={{ fontSize:15,fontWeight:700 }}>✉️ Invite Collaborator</h3>
            <button onClick={()=>setShowInviteModal(false)} style={{ background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:16 }}>✕</button>
          </div>
          <div style={{ marginBottom:16,padding:14,borderRadius:8,background:`${C.accent}08`,border:`1px solid ${C.accent}20` }}>
            <div style={{ fontSize:11,color:C.muted,marginBottom:5 }}>Share workspace link:</div>
            <div style={{ display:'flex',gap:7 }}>
              <input readOnly value={`${window.location.origin}/workspace/${workspaceId}`} style={{ ...S.inp,fontSize:10,fontFamily:'monospace',flex:1 }} />
              <button onClick={copyLink} style={{ padding:'7px 11px',borderRadius:7,background:copied?`${C.green}15`:`${C.accent}20`,border:`1px solid ${copied?`${C.green}30`:`${C.accent}30`}`,color:copied?C.green:C.accent,cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:700,whiteSpace:'nowrap' }}>{copied?'✓':'Copy'}</button>
            </div>
          </div>
          <label style={{ display:'block',fontSize:10,fontWeight:700,color:C.muted,marginBottom:5,textTransform:'uppercase' }}>Email</label>
          <input style={{ ...S.inp,marginBottom:12 }} placeholder="colleague@company.com" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSendInvite()} />
          <label style={{ display:'block',fontSize:10,fontWeight:700,color:C.muted,marginBottom:5,textTransform:'uppercase' }}>Role</label>
          <select style={{ ...S.inp,marginBottom:16,cursor:'pointer' }} value={inviteRole} onChange={e=>setInviteRole(e.target.value)}>
            <option value="viewer">👁 Viewer</option><option value="editor">✏️ Editor</option><option value="owner">👑 Owner</option>
          </select>
          <div style={{ display:'flex',gap:8 }}>
            <button onClick={handleSendInvite} disabled={inviteSending||!inviteEmail.trim()} style={{ flex:1,padding:'10px',borderRadius:7,background:C.accent,color:'#fff',border:'none',fontFamily:'inherit',fontSize:12,fontWeight:700,cursor:inviteSending?'not-allowed':'pointer',opacity:inviteSending?0.7:1 }}>{inviteSending?'Sending...':'Send Invite'}</button>
            <button onClick={()=>setShowInviteModal(false)} style={{ padding:'10px 14px',borderRadius:7,background:'transparent',color:C.muted,border:`1px solid ${C.border}`,fontFamily:'inherit',fontSize:12,cursor:'pointer' }}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
// file manager: folder tree, create/rename/delete, context menus

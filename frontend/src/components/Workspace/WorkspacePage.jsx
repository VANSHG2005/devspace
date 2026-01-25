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
import { emitCodeChange, emitCursorMove, emitSendMessage, emitTypingStart, emitTypingStop } from '../../utils/socket'
import { toast } from 'react-toastify'
import api from '../../utils/api'

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
        <button onClick={onClose} style={sb('#ff5370')}>✕</button>
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
function CameraEffects({ stream, onClose }) {
  const [blur, setBlur] = useState(0)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const previewRef = useRef(null)
  useEffect(() => {
    if (previewRef.current && stream) { previewRef.current.srcObject = stream; previewRef.current.play().catch(()=>{}) }
  }, [stream])

  const filter = `blur(${blur}px) brightness(${brightness}%) contrast(${contrast}%)`

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',zIndex:600,display:'flex',alignItems:'center',justifyContent:'center' }} onClick={onClose}>
      <div style={{ background:'#111118',border:'1px solid #1e1e2e',borderRadius:16,padding:28,width:440 }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
          <h3 style={{ fontSize:16,fontWeight:700,color:'#e2e2f0' }}>📷 Camera Effects</h3>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.08)',border:'none',color:'#6e6e8f',cursor:'pointer',width:28,height:28,borderRadius:6,fontSize:14 }}>✕</button>
        </div>
        {/* Live preview with effects */}
        <div style={{ position:'relative',marginBottom:20,borderRadius:10,overflow:'hidden',background:'#000',aspectRatio:'16/9' }}>
          <video ref={previewRef} autoPlay muted playsInline style={{ width:'100%',height:'100%',objectFit:'cover',transform:'scaleX(-1)',filter }} />
          <div style={{ position:'absolute',bottom:8,left:8,background:'rgba(0,0,0,0.7)',padding:'2px 8px',borderRadius:4,fontSize:10,color:'#7c6af7',fontWeight:700 }}>PREVIEW</div>
        </div>
        {/* Controls */}
        {[
          { label:'Background Blur', val:blur, set:setBlur, min:0, max:20, unit:'px', icon:'🌫️' },
          { label:'Brightness', val:brightness, set:setBrightness, min:50, max:200, unit:'%', icon:'☀️' },
          { label:'Contrast', val:contrast, set:setContrast, min:50, max:200, unit:'%', icon:'◑' },
        ].map(ctrl => (
          <div key={ctrl.label} style={{ marginBottom:16 }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:7 }}>
              <span style={{ fontSize:13,color:'#e2e2f0',fontWeight:600 }}>{ctrl.icon} {ctrl.label}</span>
              <span style={{ fontSize:12,color:'#7c6af7',fontFamily:'monospace',fontWeight:700 }}>{ctrl.val}{ctrl.unit}</span>
            </div>
            <input type="range" min={ctrl.min} max={ctrl.max} value={ctrl.val} onChange={e=>ctrl.set(+e.target.value)}
              style={{ width:'100%',accentColor:'#7c6af7',cursor:'pointer' }} />
          </div>
        ))}
        <div style={{ display:'flex',gap:10,marginTop:4 }}>
          <button onClick={()=>{setBlur(0);setBrightness(100);setContrast(100)}} style={{ flex:1,padding:'9px',borderRadius:8,background:'transparent',border:'1px solid #1e1e2e',color:'#6e6e8f',cursor:'pointer',fontFamily:'inherit',fontSize:12 }}>Reset</button>
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
  const [wbColor, setWbColor] = useState('#7c6af7')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [mediaStreams, setMediaStreams] = useState([])
  const [showCameraEffects, setShowCameraEffects] = useState(false)
  const [renameItem, setRenameItem] = useState(null)
  const [localFiles, setLocalFiles] = useState([])

  const chatEndRef = useRef(null)
  const typingRef = useRef(null)
  const canvasRef = useRef(null)
  const drawing = useRef(false); const lastPos = useRef(null)
  const editorRef = useRef(null); const decsRef = useRef([])

  useSocket(workspaceId)
  useAutoSave(workspaceId)
  const { micOn, screenOn, cameraOn, startVoiceChat, stopVoiceChat, startScreenShare, stopScreenShare, startCameraShare, stopCameraShare } = useWebRTC(workspaceId, setMediaStreams)

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
      const lm = {js:'javascript',ts:'typescript',py:'python',jsx:'javascript',tsx:'typescript',css:'css',json:'json',md:'markdown',sql:'sql',html:'html'}
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

  const handleRunCode = () => { dispatch(setActivePanel('terminal')); dispatch(clearExecutionOutput()); dispatch(executeCode({ code, language })) }

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

  const startDraw=(e)=>{ drawing.current=true; const r=canvasRef.current.getBoundingClientRect(); lastPos.current={x:e.clientX-r.left,y:e.clientY-r.top} }
  const doDraw=(e)=>{
    if(!drawing.current||!lastPos.current) return
    const c=canvasRef.current,ctx=c.getContext('2d'),r=c.getBoundingClientRect()
    const x=e.clientX-r.left,y=e.clientY-r.top
    ctx.strokeStyle=wbMode==='eraser'?'#111118':wbColor; ctx.lineWidth=wbMode==='eraser'?24:2.5; ctx.lineCap='round'; ctx.lineJoin='round'
    ctx.beginPath(); ctx.moveTo(lastPos.current.x,lastPos.current.y); ctx.lineTo(x,y); ctx.stroke(); lastPos.current={x,y}
  }
  const stopDraw=()=>{ drawing.current=false }
  const clearCanvas=()=>{ const ctx=canvasRef.current?.getContext('2d'); if(ctx) ctx.clearRect(0,0,canvasRef.current.width,canvasRef.current.height) }

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
      <div style={{ height:48,borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',padding:'0 12px',gap:7,flexShrink:0,background:C.surface }}>
        <div style={{ display:'flex',alignItems:'center',gap:7,paddingRight:10,borderRight:`1px solid ${C.border}` }}>
          <div style={{ width:24,height:24,borderRadius:6,background:'linear-gradient(135deg,#7c6af7,#ff7eb3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11 }}>{'<>'}</div>
          <span style={{ fontWeight:800,fontSize:13 }}>DevSpace</span>
        </div>
        <span style={{ fontSize:13,fontWeight:700 }}>{workspace?.name||'Workspace'}</span>
        <span style={{ fontSize:11,color:C.muted,fontFamily:'monospace' }}>/{workspaceId}</span>
        <div style={{ display:'flex',alignItems:'center',gap:4 }}>
          <div style={{ width:6,height:6,borderRadius:'50%',background:savedStatus==='saved'?C.green:savedStatus==='saving'?C.yellow:C.red }} />
          <span style={{ fontSize:10,color:savedStatus==='saved'?C.green:C.yellow,fontFamily:'monospace' }}>{savedStatus}</span>
        </div>
        <div style={{ marginLeft:'auto',display:'flex',alignItems:'center',gap:5 }}>
          <div style={{ display:'flex',gap:2,paddingRight:8,borderRight:`1px solid ${C.border}`,alignItems:'center' }}>
            {(onlineUsers||[]).slice(0,6).map(u=>(
              <div key={u.id} title={u.name} style={{ width:26,height:26,borderRadius:'50%',background:u.avatar_url?'none':`linear-gradient(135deg,${u.color||C.accent}80,${u.color||C.accent})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff',border:`2px solid ${C.surface}`,overflow:'hidden' }}>
                {u.avatar_url?<img src={u.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:u.name?.charAt(0).toUpperCase()}
              </div>
            ))}
            <span style={{ fontSize:10,color:C.muted,marginLeft:2,fontFamily:'monospace' }}>{(onlineUsers||[]).length||1} online</span>
          </div>
          <button style={S.btn(micOn)} onClick={async()=>{ if(micOn){stopVoiceChat();toast.info('Mic off')} else{try{await startVoiceChat();toast.success('🎙️ Voice on')}catch(e){toast.error('Mic: '+e.message)}} }}>🎙️ {micOn?'Live':'Mic'}</button>
          <button style={S.btn(cameraOn)} onClick={async()=>{ if(cameraOn){stopCameraShare();toast.info('Camera off')} else{try{await startCameraShare();toast.success('📷 Camera on')}catch(e){toast.error('Camera: '+e.message)}} }}>📷 {cameraOn?'On':'Cam'}</button>
          {cameraOn && <button style={S.btn(false)} onClick={()=>setShowCameraEffects(true)} title="Camera effects">✨</button>}
          <button style={S.btn(screenOn)} onClick={async()=>{ if(screenOn){stopScreenShare();toast.info('Share stopped')} else{try{await startScreenShare();toast.success('🖥️ Sharing')}catch(e){if(e.name!=='NotAllowedError')toast.error(e.message)}} }}>🖥️ {screenOn?'Stop':'Share'}</button>
          <button style={S.btn(false)} onClick={handleRunCode}>▶ Run</button>
          <button style={S.btn(showVersions)} onClick={()=>{ setShowVersions(true); dispatch(fetchVersions({workspaceId,fileId:activeFileId})) }}>🔀 Ver</button>
          <button style={S.btn(false)} onClick={()=>setShowInviteModal(true)}>✉️</button>
          <button style={S.btn(copied)} onClick={copyLink}>{copied?'✓ Copied':'🔗 Share'}</button>
          <button onClick={()=>navigate('/dashboard')} style={S.btn(false,true)}>Leave ↗</button>
        </div>
      </div>

      {/* Body */}
      <div ref={bodyRef} style={{ flex:1,display:'flex',overflow:'hidden' }}>

        {/* Sidebar */}
        <div style={{ width:sidebarW,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',background:C.surface,flexShrink:0 }}>
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
                {folder.children.map(f=><FileRow key={f.id} file={f} isActive={f.id===activeFileId} onSelect={()=>dispatch(setActiveFile(f))} onRename={f=>setRenameItem({item:f,isFolder:false})} onDelete={f=>setDeleteConfirm(f)} workspaceId={workspaceId} indent={1} />)}
              </FolderRow>
            ))}
            {fileTree.rootFiles.map(f=><FileRow key={f.id} file={f} isActive={f.id===activeFileId} onSelect={()=>dispatch(setActiveFile(f))} onRename={f=>setRenameItem({item:f,isFolder:false})} onDelete={f=>setDeleteConfirm(f)} workspaceId={workspaceId} />)}
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

        <DragHandle onDrag={handleRightDrag} />

        {/* Right panel */}
        <div style={{ width:rightW,borderLeft:`1px solid ${C.border}`,display:'flex',flexDirection:'column',flexShrink:0 }}>
          <div style={{ display:'flex',borderBottom:`1px solid ${C.border}`,background:C.surface }}>
            {[{id:'chat',e:'💬',l:'Chat'},{id:'terminal',e:'⌨️',l:'Term'},{id:'ai',e:'✨',l:'AI'},{id:'whiteboard',e:'🎨',l:'Board'}].map(p=>(
              <button key={p.id} style={S.tab(p.id)} onClick={()=>dispatch(setActivePanel(p.id))}><span>{p.e}</span><span>{p.l}</span></button>
            ))}
          </div>

          {/* Chat */}
          {activePanel==='chat' && (
            <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
              <div style={{ flex:1,overflowY:'auto',padding:'10px',display:'flex',flexDirection:'column',gap:8 }}>
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
              <div style={{ padding:'8px 10px',borderTop:`1px solid ${C.border}`,display:'flex',gap:7 }}>
                <input style={{ ...S.inp,flex:1,fontSize:12 }} placeholder="Message..." value={newMsg} onChange={e=>setNewMsg(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendMessage()} />
                <button onClick={sendMessage} style={{ padding:'8px 12px',borderRadius:8,background:C.accent,color:'#fff',border:'none',cursor:'pointer',fontSize:14 }}>↑</button>
              </div>
            </div>
          )}

          {/* Terminal */}
          {activePanel==='terminal' && (
            <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden',background:'#0d1117' }}>
              <div style={{ flex:1,overflowY:'auto',padding:'12px',fontFamily:"'JetBrains Mono',monospace",fontSize:12,lineHeight:1.8 }}>
                <div style={{ color:C.muted,marginBottom:6 }}>DevSpace Terminal · {language} · {workspaceId}</div>
                {executionOutput.map((l,i)=><div key={i} style={{ color:l.type==='result'?C.green:l.type==='error'?C.red:'#89ddff',marginBottom:2,whiteSpace:'pre-wrap',wordBreak:'break-all' }}>{l.type==='result'&&<span style={{color:C.muted}}>▸ </span>}{l.type==='error'&&<span style={{color:C.red}}>✗ </span>}{l.text}</div>)}
                {executionLoading && <div style={{ color:C.yellow,display:'flex',alignItems:'center',gap:8 }}><div style={{ width:11,height:11,borderRadius:'50%',border:'2px solid rgba(255,202,40,0.3)',borderTopColor:C.yellow,animation:'spin 0.7s linear infinite' }} />Running...</div>}
                {!executionLoading&&executionOutput.length===0 && <div style={{ color:'#3a3a55',fontStyle:'italic' }}>No output. Click ▶ Run.</div>}
                <div style={{ marginTop:8 }}><span style={{ color:C.green }}>devspace</span><span style={{ color:C.accent }}>:~$ </span><span style={{ borderRight:`2px solid ${C.accent}`,animation:'blink 1s infinite' }}>&nbsp;</span></div>
              </div>
              <div style={{ padding:'7px 10px',borderTop:'1px solid #1a1a2e',display:'flex',gap:7 }}>
                <button onClick={handleRunCode} style={{ flex:1,padding:'7px',borderRadius:7,background:`${C.green}12`,border:`1px solid ${C.green}30`,color:C.green,cursor:'pointer',fontFamily:'inherit',fontSize:11,fontWeight:700 }}>▶ Run {language}</button>
                <button onClick={()=>dispatch(clearExecutionOutput())} style={{ padding:'7px 11px',borderRadius:7,background:'transparent',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',fontFamily:'inherit',fontSize:11 }}>Clear</button>
              </div>
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
              <div style={{ padding:'8px 10px',borderTop:`1px solid ${C.border}` }}>
                <textarea style={{ ...S.inp,minHeight:60,resize:'vertical',marginBottom:7,fontSize:12 }} placeholder="Ask about the code... (Enter to send)" value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleAskAI()}}} />
                <button onClick={handleAskAI} disabled={aiLoading||!aiInput.trim()} style={{ width:'100%',padding:'9px',borderRadius:7,background:C.accent,color:'#fff',border:'none',fontFamily:'inherit',fontSize:12,fontWeight:700,cursor:aiLoading?'not-allowed':'pointer',opacity:aiLoading?0.7:1 }}>{aiLoading?'✦ Thinking...':'✨ Ask AI (Enter)'}</button>
              </div>
            </div>
          )}

          {/* Whiteboard */}
          {activePanel==='whiteboard' && (
            <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
              <div style={{ padding:'6px 10px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:5,alignItems:'center',flexWrap:'wrap' }}>
                {['pen','eraser'].map(m=><button key={m} onClick={()=>setWbMode(m)} style={{ ...S.btn(wbMode===m),fontSize:10 }}>{m==='pen'?'✏️':'🧹'} {m}</button>)}
                {['#7c6af7','#3dffa0','#ff5370','#ffca28','#89ddff','#ff7eb3','#fff'].map(c=><button key={c} onClick={()=>{setWbMode('pen');setWbColor(c)}} style={{ width:18,height:18,borderRadius:'50%',background:c,border:wbColor===c?'2px solid #fff':'2px solid transparent',cursor:'pointer' }}/>)}
                <button onClick={clearCanvas} style={{ ...S.btn(false),marginLeft:'auto',color:C.red,borderColor:'rgba(255,83,112,0.3)',fontSize:10 }}>🗑</button>
              </div>
              <canvas ref={canvasRef} width={400} height={800} style={{ flex:1,cursor:wbMode==='eraser'?'cell':'crosshair',background:C.surface,display:'block' }} onMouseDown={startDraw} onMouseMove={doDraw} onMouseUp={stopDraw} onMouseLeave={stopDraw} />
            </div>
          )}
        </div>
      </div>

      {/* Floating media */}
      {mediaStreams.length>0 && <FloatingMedia streams={mediaStreams} onClose={()=>{stopScreenShare();stopCameraShare();setMediaStreams([])}} />}

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

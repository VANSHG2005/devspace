import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const C = { bg:'#0a0a0f', surface:'#111118', border:'#1e1e2e', accent:'#7c6af7', green:'#3dffa0', red:'#ff5370', yellow:'#ffca28', blue:'#82aaff', cyan:'#89ddff', text:'#e2e2f0', muted:'#6e6e8f', dim:'#3a3a55' }

const FEATURES = [
  { icon:'⚡', title:'Real-Time Sync',       desc:'Sub-10ms code sync using WebSockets and Redis caching across all collaborators.',  color: C.yellow },
  { icon:'👥', title:'Live Cursors',          desc:'See exactly where teammates are editing with named cursor overlays.',               color: C.green  },
  { icon:'💬', title:'Built-in Chat',         desc:'Contextual team chat integrated directly into the workspace.',                     color: C.cyan   },
  { icon:'🔐', title:'Secure Auth',           desc:'JWT + bcrypt authentication with role-based access control.',                      color: C.accent },
  { icon:'▶️', title:'Code Execution',        desc:'Run JavaScript and Python directly in the sandboxed terminal.',                   color: C.red    },
  { icon:'✨', title:'AI Assistant',          desc:'GPT-4o integration for code review, refactoring, and explanations.',              color:'#ff9f43' },
  { icon:'🎙️', title:'Voice Chat',           desc:'WebRTC peer-to-peer voice — talk without leaving the editor.',                   color: C.blue   },
  { icon:'📺', title:'Screen Sharing',        desc:'Share your screen via WebRTC for pair programming sessions.',                     color: C.green  },
  { icon:'🎨', title:'Whiteboard',            desc:'Draw diagrams and sketch ideas together on a shared canvas.',                     color: C.accent },
  { icon:'🔀', title:'Version Control',       desc:'Save named snapshots and restore any previous version with one click.',           color: C.yellow },
  { icon:'👑', title:'Workspace Roles',       desc:'Owner, Editor, and Viewer roles with fine-grained permissions.',                  color: C.red    },
  { icon:'📊', title:'Analytics',             desc:'Track edits, active users, and workspace activity in real time.',                 color: C.cyan   },
]

const STACK = ['React 18','Redux Toolkit','Vite','Socket.io','Node.js','Express','Supabase','Redis','WebRTC','JWT','Docker','OpenAI']

export default function LandingPage() {
  const navigate = useNavigate()
  const [joinId, setJoinId] = useState('')

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>

      {/* Nav */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', background: `${C.bg}cc`, backdropFilter: 'blur(20px)', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg,${C.accent},#ff7eb3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>⌨️</div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.5px' }}>DevSpace</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: `${C.accent}20`, color: C.accent, border: `1px solid ${C.accent}30`, fontFamily: 'monospace' }}>v2.0</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate('/login')} style={{ padding: '8px 18px', borderRadius: 8, background: 'transparent', border: `1px solid ${C.border}`, color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Sign In</button>
          <button onClick={() => navigate('/signup')} style={{ padding: '8px 18px', borderRadius: 8, background: C.accent, border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Get Started</button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ paddingTop: 130, paddingBottom: 100, textAlign: 'center', position: 'relative', backgroundImage: `linear-gradient(${C.border}40 1px,transparent 1px),linear-gradient(90deg,${C.border}40 1px,transparent 1px)`, backgroundSize: '40px 40px' }}>
        <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 350, background: `radial-gradient(ellipse,${C.accent}12,transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px', position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 99, border: `1px solid ${C.accent}40`, background: `${C.accent}12`, fontSize: 12, fontWeight: 600, color: C.accent, marginBottom: 32, fontFamily: 'monospace' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, animation: 'pulse 2s infinite' }} /> Now with Supabase + Vite ⚡
          </div>
          <h1 style={{ fontSize: 'clamp(40px,8vw,84px)', fontWeight: 800, lineHeight: 1.04, letterSpacing: '-4px', marginBottom: 24 }}>
            Real-Time{' '}
            <span style={{ background: `linear-gradient(135deg,${C.accent},#ff7eb3,${C.cyan})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Collaborative</span>
            <br />Workspace
          </h1>
          <p style={{ fontSize: 20, color: C.muted, marginBottom: 16, lineHeight: 1.6 }}>Code Together. Build Together. In Real Time.</p>
          <p style={{ fontSize: 13, color: C.dim, marginBottom: 48, fontFamily: 'monospace' }}>React + Vite · Socket.io · Supabase · Redis · WebRTC · Docker</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
            <button onClick={() => navigate('/signup')} style={{ padding: '14px 36px', borderRadius: 10, background: C.accent, border: 'none', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 8px 32px ${C.accent}40` }}>
              ✦ Create Workspace
            </button>
            <button onClick={() => navigate('/login')} style={{ padding: '14px 36px', borderRadius: 10, background: 'transparent', border: `1px solid ${C.border}`, color: C.text, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Sign In
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', maxWidth: 400, margin: '0 auto' }}>
            <input value={joinId} onChange={e => setJoinId(e.target.value)} placeholder="Enter workspace ID to join..."
              onKeyDown={e => e.key === 'Enter' && joinId && navigate(`/workspace/${joinId}`)}
              style={{ flex: 1, padding: '10px 14px', borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, fontFamily: 'monospace', outline: 'none' }} />
            <button onClick={() => joinId && navigate(`/workspace/${joinId}`)}
              style={{ padding: '10px 18px', borderRadius: 8, background: `${C.accent}20`, border: `1px solid ${C.accent}40`, color: C.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              Join →
            </button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: '80px 40px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-2px', marginBottom: 12 }}>
            Everything you need to <span style={{ color: C.accent }}>build together</span>
          </h2>
          <p style={{ color: C.muted, fontSize: 16 }}>20+ production features built for developer teams</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 16 }}>
          {FEATURES.map((f, i) => (
            <div key={i}
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, transition: 'all 0.2s', cursor: 'default' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = f.color + '60'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = '' }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stack */}
      <section style={{ padding: '60px 40px', background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ color: C.muted, fontSize: 12, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 24, fontFamily: 'monospace' }}>TECH STACK</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {STACK.map(t => (
              <span key={t} style={{ padding: '6px 14px', borderRadius: 6, background: `${C.accent}10`, border: `1px solid ${C.accent}25`, color: C.accent, fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '100px 40px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-2px', marginBottom: 16 }}>Ready to build together?</h2>
        <p style={{ color: C.muted, marginBottom: 40, fontSize: 16 }}>Free to use. No credit card required.</p>
        <button onClick={() => navigate('/signup')} style={{ padding: '16px 48px', borderRadius: 12, background: C.accent, border: 'none', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 12px 40px ${C.accent}40` }}>
          Start Coding Together →
        </button>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: '32px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>DevSpace</span>
          <span style={{ color: C.dim, fontSize: 13 }}>© 2025 — MIT License</span>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          {['GitHub', 'Docs', 'Privacy'].map(l => (
            <a key={l} href="#" style={{ color: C.muted, fontSize: 13 }}>{l}</a>
          ))}
        </div>
      </footer>
    </div>
  )
}

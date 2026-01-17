# 🚀 DevSpace — Real-Time Collaborative Workspace

> Production-grade full-stack collaborative coding platform built with React, Node.js, Socket.io, **Supabase**, and Redis.

## ✨ Features

### Core
- ✅ JWT Authentication (Signup / Login / Logout)
- ✅ Real-time Code Sync (WebSocket + Redis cache)
- ✅ Live Cursor Tracking
- ✅ Real-time Chat (persisted to Supabase)
- ✅ Online User Indicators
- ✅ Room Creation with shareable links
- ✅ Auto-Save every 5 seconds → Supabase
- ✅ File Management (Create, Rename, Delete)

### Advanced
- ✅ Voice Chat (WebRTC peer-to-peer)
- ✅ Screen Sharing (WebRTC)
- ✅ Code Execution (JavaScript sandboxed + Python)
- ✅ Version Control with restore
- ✅ Email Invites
- ✅ Dark/Light Mode
- ✅ Typing Indicators / Presence
- ✅ Collaborative Whiteboard
- ✅ Workspace Roles (Owner / Editor / Viewer)
- ✅ Analytics Dashboard
- ✅ AI Code Assistant (GPT-4o)

## 🧱 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Redux Toolkit, React Router v6, Socket.io Client |
| Backend | Node.js, Express.js, Socket.io |
| Database | **Supabase** (PostgreSQL hosted + JS SDK) |
| Cache | Redis 7 (Socket.io adapter + code state) |
| Auth | Custom JWT + bcrypt (server-managed, not Supabase Auth) |
| P2P | WebRTC (voice + screen share via simple-peer) |
| AI | OpenAI GPT-4o |
| DevOps | Docker, Nginx, GitHub Actions |
| Deploy | Vercel (frontend) + Railway/Render (backend) |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Redis (local or free [Upstash](https://upstash.com))
- [Supabase](https://supabase.com) free project

### 1. Create Supabase project
→ [supabase.com](https://supabase.com) → New Project → copy URL + keys

### 2. Run database schema
Supabase Dashboard → SQL Editor → paste `backend/database/supabase_schema.sql` → Run

### 3. Backend
```bash
cd backend
npm install
cp .env.example .env    # Fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET
npm run dev             # → :3001
```

### 4. Frontend
```bash
cd frontend
npm install
cp .env.example .env    # Set REACT_APP_API_URL=http://localhost:3001/api
npm start               # → :3000
```

### 5. Docker (all-in-one)
```bash
cp .env.example .env    # Fill in Supabase keys
docker-compose up --build
# → http://localhost
```

## 📁 Project Structure

```
devspace/
├── frontend/src/
│   ├── components/     Landing, Auth, Dashboard, Workspace
│   ├── store/slices/   Redux: auth, workspace, ui
│   ├── hooks/          useSocket, useWebRTC, useAutoSave
│   └── utils/          api.js, socket.js, ot.js
├── backend/src/
│   ├── config/         database.js (Supabase client)
│   ├── controllers/    auth, workspace, file, code, ai
│   ├── routes/         Express routers
│   ├── sockets/        Socket.io event handlers
│   └── middleware/     JWT auth, rate limit, validation
├── backend/database/
│   └── supabase_schema.sql   ← Run this in Supabase SQL Editor
├── docker-compose.yml
└── DEPLOYMENT.md       ← Full step-by-step guide
```

## 📝 Resume Description
> Built production-grade real-time collaborative coding platform for 50+ concurrent users using React, Node.js, Socket.io, Supabase, Redis, and WebRTC. Implemented Operational Transformation for concurrent editing, JWT authentication, role-based access control, sandboxed code execution, and GPT-4o AI assistance.

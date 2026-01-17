# 🚀 DevSpace — Complete Setup & Deployment Guide (Supabase Edition)

## Architecture Overview

```
Browser (React)
    │  REST + WebSocket
    ▼
Express + Socket.io (Node.js :3001)
    │                    │
    │ Supabase JS SDK     │ Redis Pub/Sub
    ▼                    ▼
Supabase (PostgreSQL)  Redis (session cache)
```

---

## STEP 1 — Create a Supabase Project (Free)

1. Go to **https://supabase.com** and click **"Start your project"**
2. Sign in with GitHub
3. Click **"New Project"**
   - Name: `devspace`
   - Database password: choose a strong password (save it)
   - Region: pick closest to you
4. Wait ~2 minutes for your project to be created

---

## STEP 2 — Run the Database Schema

1. In your Supabase dashboard, click **"SQL Editor"** in the left sidebar
2. Click **"New Query"**
3. Open the file `backend/database/supabase_schema.sql` in your code editor
4. Copy the **entire contents** and paste into the Supabase SQL editor
5. Click **"Run"** (or press `Ctrl+Enter`)
6. You should see: `DevSpace Supabase schema created successfully ✅`

---

## STEP 3 — Get Your Supabase API Keys

1. In Supabase dashboard → **Settings** (gear icon) → **API**
2. Copy these three values:

| Value | Where to find it |
|-------|-----------------|
| **Project URL** | "Project URL" section — looks like `https://abcxyz.supabase.co` |
| **anon public key** | "Project API Keys" → `anon public` |
| **service_role key** | "Project API Keys" → `service_role` ⚠️ Keep secret! |

---

## STEP 4 — Configure Backend Environment

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and fill in:

```env
NODE_ENV=development
PORT=3001

# Paste your Supabase values here:
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Redis (local for now — see Step 5)
REDIS_URL=redis://localhost:6379

# Make up any long random string (min 32 chars):
JWT_SECRET=devspace_my_super_secret_jwt_key_2025_change_this

# Your frontend URL:
CLIENT_URL=http://localhost:3000

# Optional — add OpenAI key to enable AI assistant:
OPENAI_API_KEY=
```

---

## STEP 5 — Start Redis

Redis is used for caching code state between socket connections.

```bash
# macOS:
brew install redis && brew services start redis

# Ubuntu/Debian:
sudo apt install redis-server && sudo systemctl start redis

# Windows:
# Download from https://github.com/microsoftarchive/redis/releases
# OR use free cloud Redis → see "Cloud Redis" below

# Verify it works:
redis-cli ping   # Should print: PONG
```

### ☁️ Free Cloud Redis (skip local install)
Use **Upstash** — free tier, no install needed:
1. Go to **https://upstash.com** → Create account → New Database
2. Copy the **"Redis URL"** (starts with `rediss://`)
3. Paste it as `REDIS_URL=rediss://...` in your `.env`

---

## STEP 6 — Install & Start Backend

```bash
cd backend
npm install        # ~1 minute
npm run dev        # starts on port 3001
```

Expected output:
```
✅ Supabase connected
✅ Redis connected — Socket.io adapter ready
🚀 DevSpace backend running on port 3001
   DB: Supabase | Cache: Redis
```

---

## STEP 7 — Configure & Start Frontend

```bash
cd frontend
cp .env.example .env
```

Open `frontend/.env`:
```env
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_WS_URL=http://localhost:3001
REACT_APP_APP_NAME=DevSpace
```

```bash
npm install        # ~2 minutes
npm start          # opens http://localhost:3000
```

---

## STEP 8 — Verify Everything

Open http://localhost:3000 and:
1. ✅ Landing page loads
2. ✅ Sign up with any email/password
3. ✅ Dashboard appears with "New Workspace" button
4. ✅ Create a workspace → editor opens
5. ✅ Open a second tab in incognito, sign in, join the same workspace ID → see both users online

### Verify backend health:
```bash
curl http://localhost:3001/health
# Returns: {"status":"ok","db":"supabase","timestamp":"..."}
```

### Verify data in Supabase:
- Supabase Dashboard → **Table Editor** → `users` — you should see your new account

---

## Production Deployment

### Frontend → Vercel (free)
```bash
cd frontend
npm run build
npx vercel deploy --prod

# Set env vars in Vercel dashboard:
# REACT_APP_API_URL = https://your-backend.railway.app/api
# REACT_APP_WS_URL  = https://your-backend.railway.app
```

### Backend → Railway (free tier)
1. **railway.app** → New Project → Deploy from GitHub
2. Select your repo → set root directory to `backend`
3. Add environment variables (all from your `.env`)
4. Railway auto-provides a URL like `https://devspace-backend.railway.app`

### Backend → Render (free tier)
1. **render.com** → New Web Service → Connect GitHub
2. Root directory: `backend`
3. Build: `npm install` | Start: `npm start`
4. Add environment variables

### Supabase (already cloud — no action needed)
Your Supabase project is already hosted. Just make sure:
- The `SUPABASE_URL` in your production `.env` matches your project
- RLS policies are correct if you want to use the anon key directly

---

## 🔧 Troubleshooting

### "Invalid API key" from Supabase
- Double-check you copied the full key (they're very long JWT strings)
- Make sure `SUPABASE_SERVICE_ROLE_KEY` is set — the anon key alone won't work for server inserts

### "Redis connection refused"
- Start Redis locally: `redis-server`
- Or switch to Upstash and use a `rediss://` URL in `.env`

### "Cannot find module '@supabase/supabase-js'"
```bash
cd backend && npm install
```

### Frontend shows blank page
- Check `frontend/.env` has correct `REACT_APP_API_URL`
- Make sure backend is running (`npm run dev` in backend/)
- Check browser console for errors

### Supabase RLS blocking inserts
- The schema sets `service_role` bypass policies
- Make sure you're using `SUPABASE_SERVICE_ROLE_KEY` (not anon key) for `supabaseAdmin`

---

## Quick Reference

```bash
# ── Backend ───────────────────────────────
cd backend && npm run dev        # Dev with auto-reload
cd backend && npm start          # Production

# ── Frontend ──────────────────────────────
cd frontend && npm start         # Dev server :3000
cd frontend && npm run build     # Production build

# ── Supabase ──────────────────────────────
# View tables:  Supabase Dashboard → Table Editor
# Run SQL:      Supabase Dashboard → SQL Editor
# View logs:    Supabase Dashboard → Logs

# ── Redis ─────────────────────────────────
redis-cli ping                   # Check Redis is running
redis-cli keys "room:*"          # See cached room state
redis-cli flushall               # Clear all cache

# ── Docker (all-in-one except Supabase) ───
docker-compose up --build        # Starts: Node + Redis + Nginx
# Note: Docker compose no longer includes PostgreSQL
# Supabase is cloud-hosted, no local DB container needed
```

import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import Redis from 'ioredis'

import { supabaseAdmin } from './config/database.js'
import authRoutes      from './routes/auth.routes.js'
import workspaceRoutes from './routes/workspace.routes.js'
import fileRoutes      from './routes/file.routes.js'
import codeRoutes      from './routes/code.routes.js'
import aiRoutes        from './routes/ai.routes.js'
import { setIo } from './controllers/workspace.controller.js'
import { registerSocketHandlers } from './sockets/index.js'

const app = express()
const httpServer = createServer(app)

// ── Redis (supports Upstash TLS rediss:// and plain redis://) ─────────────
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const isTLS = REDIS_URL.startsWith('rediss://')
const redisOpts = {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  ...(isTLS ? { tls: { rejectUnauthorized: false } } : {}),
}
const pubClient = new Redis(REDIS_URL, redisOpts)
const subClient = new Redis(REDIS_URL, { ...redisOpts })

pubClient.on('error', (e) => console.warn('Redis pub error:', e.message))
subClient.on('error', (e) => console.warn('Redis sub error:', e.message))

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }))
app.use(compression())
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true)
    if (allowedOrigins.some(o => origin.startsWith(o.replace(/\/$/, '')))) {
      return callback(null, true)
    }
    return callback(new Error(`CORS blocked: ${origin}`))
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}))
app.options('*', cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes)
app.use('/api/workspaces', workspaceRoutes)
app.use('/api/files',      fileRoutes)
app.use('/api/code',       codeRoutes)
app.use('/api/ai',         aiRoutes)

// Also mount execute at /api/execute (frontend calls this)
app.use('/api', codeRoutes)

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))
app.use((req, res) => res.status(404).json({ error: 'Route not found' }))
app.use((err, req, res, next) => {
  console.error('Error:', err.message)
  res.status(err.status || 500).json({ error: err.message })
})

// ── Socket.io ──────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, credentials: true, methods: ['GET','POST'] },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ── Start server immediately, connect services in background ───────────────
const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
  console.log(`🚀 DevSpace backend running on port ${PORT}`)
})

// Register socket handlers immediately (works without Redis, degrades gracefully)
registerSocketHandlers(io, pubClient)

// Connect Redis in background
const connectRedis = async () => {
  try {
    await Promise.all([pubClient.connect(), subClient.connect()])
    io.adapter(createAdapter(pubClient, subClient))
    console.log('✅ Redis connected')
  } catch (err) {
    console.warn('⚠️  Redis unavailable, retrying in 10s:', err.message)
    setTimeout(connectRedis, 10000)
  }
}

// Connect Supabase in background
const connectSupabase = async () => {
  try {
    const { error } = await supabaseAdmin.from('users').select('id').limit(1)
    if (error) throw new Error(error.message)
    console.log('✅ Supabase connected')
  } catch (err) {
    console.warn('⚠️  Supabase unavailable, retrying in 10s:', err.message?.slice(0, 80))
    setTimeout(connectSupabase, 10000)
  }
}

connectRedis()
connectSupabase()

process.on('SIGTERM', () => {
  httpServer.close(() => { pubClient.quit(); process.exit(0) })
})
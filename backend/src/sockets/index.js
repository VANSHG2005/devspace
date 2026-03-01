import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../config/database.js'
import { v4 as uuidv4 } from 'uuid'

export const EVENTS = {
  JOIN_ROOM:       'JOIN_ROOM',
  LEAVE_ROOM:      'LEAVE_ROOM',
  USER_JOINED:     'USER_JOINED',
  USER_LEFT:       'USER_LEFT',
  ROOM_USERS:      'ROOM_USERS',
  CODE_CHANGE:     'CODE_CHANGE',
  SYNC_CODE:       'SYNC_CODE',
  CURSOR_MOVE:     'CURSOR_MOVE',
  CURSOR_UPDATE:   'CURSOR_UPDATE',
  SEND_MESSAGE:    'SEND_MESSAGE',
  RECEIVE_MESSAGE: 'RECEIVE_MESSAGE',
  MESSAGE_HISTORY: 'MESSAGE_HISTORY',
  TYPING_START:    'TYPING_START',
  TYPING_STOP:     'TYPING_STOP',
  PRESENCE_UPDATE: 'PRESENCE_UPDATE',
  FILE_CREATED:    'FILE_CREATED',
  FILE_DELETED:    'FILE_DELETED',
  WEBRTC_SIGNAL:   'WEBRTC_SIGNAL',
}

// Track recent disconnects to suppress left/joined on page reload
// { userId_roomId: timestamp }
const recentDisconnects = new Map()
const RECONNECT_GRACE_MS = 4000 // 4 seconds — if user rejoins within this, don't show left/joined

export const registerSocketHandlers = (io, redisClient) => {

  // ── Auth middleware ───────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token
      if (!token) return next(new Error('Authentication required'))
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      const { data: user, error } = await supabaseAdmin
        .from('users')
        .select('id, name, email, color, avatar')
        .eq('id', decoded.id)
        .single()
      if (error || !user) return next(new Error('User not found'))
      socket.user = user
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket) => {
    console.log(`✔ Connected: ${socket.user.name}`)

    // ── JOIN_ROOM ───────────────────────────────────────────────────────────
    socket.on(EVENTS.JOIN_ROOM, async ({ roomId, fileId }) => {
      try {
        socket.join(roomId)
        socket.currentRoom = roomId
        socket.currentFileId = fileId

        // Check if this is a reconnect (page reload)
        const key = `${socket.user.id}_${roomId}`
        const wasRecentlyHere = recentDisconnects.has(key)
        recentDisconnects.delete(key)

        // Sync code — Redis first, fallback to Supabase
        const activeFileId = fileId
        if (activeFileId) {
          let content = null
          try {
            content = await redisClient.get(`room:${roomId}:file:${activeFileId}`)
          } catch {}

          if (!content) {
            const { data: file } = await supabaseAdmin
              .from('files').select('content').eq('id', activeFileId).single()
            content = file?.content || ''
            try { await redisClient.setEx(`room:${roomId}:file:${activeFileId}`, 3600, content) } catch {}
          }
          socket.emit(EVENTS.SYNC_CODE, { fileId: activeFileId, content })
        }

        // Message history
        const { data: history } = await supabaseAdmin
          .from('messages')
          .select('*, user:users(id, name, color, avatar)')
          .eq('workspace_id', roomId)
          .order('created_at', { ascending: false })
          .limit(50)

        const msgs = (history || []).reverse().map(m => ({
          id: m.id, user: m.user, message: m.content,
          createdAt: m.created_at,
          time: new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }))
        socket.emit(EVENTS.MESSAGE_HISTORY, msgs)

        // Always send updated user list
        const sockets = await io.in(roomId).fetchSockets()
        io.to(roomId).emit(EVENTS.ROOM_USERS, sockets.map(s => s.user).filter(Boolean))

        // Only notify others if NOT a reconnect (suppress on page reload)
        if (!wasRecentlyHere) {
          socket.to(roomId).emit(EVENTS.USER_JOINED, socket.user)
        }

        // Analytics
        supabaseAdmin.from('workspace_analytics').insert({
          id: uuidv4(), workspace_id: roomId, user_id: socket.user.id,
          event_type: 'join', metadata: { socketId: socket.id },
        }).then(() => {}).catch(() => {})

      } catch (err) {
        console.error('JOIN_ROOM error:', err.message)
      }
    })

    // ── CODE_CHANGE ─────────────────────────────────────────────────────────
    socket.on(EVENTS.CODE_CHANGE, async ({ roomId, fileId, content }) => {
      try {
        socket.to(roomId).emit(EVENTS.CODE_CHANGE, { fileId, content, userId: socket.user.id })
        if (fileId) {
          try { await redisClient.setEx(`room:${roomId}:file:${fileId}`, 3600, content) } catch {}
        }
        supabaseAdmin.from('workspace_analytics').insert({
          id: uuidv4(), workspace_id: roomId, user_id: socket.user.id,
          event_type: 'edit', metadata: { fileId },
        }).then(() => {}).catch(() => {})
      } catch (err) {
        console.error('CODE_CHANGE error:', err.message)
      }
    })

    // ── CURSOR_MOVE ─────────────────────────────────────────────────────────
    socket.on(EVENTS.CURSOR_MOVE, ({ roomId, line, col, fileId }) => {
      socket.to(roomId).emit(EVENTS.CURSOR_UPDATE, {
        userId: socket.user.id, name: socket.user.name,
        color: socket.user.color, line, col, fileId,
      })
    })

    // ── SEND_MESSAGE ────────────────────────────────────────────────────────
    socket.on(EVENTS.SEND_MESSAGE, async ({ roomId, message }) => {
      try {
        if (!message?.trim()) return
        const msgId = uuidv4()
        const timestamp = new Date()
        const payload = {
          id: msgId, user: socket.user, message: message.trim(),
          createdAt: timestamp.toISOString(),
          time: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }
        io.to(roomId).emit(EVENTS.RECEIVE_MESSAGE, payload)
        await supabaseAdmin.from('messages').insert({
          id: msgId, workspace_id: roomId, user_id: socket.user.id,
          content: message.trim(), created_at: timestamp.toISOString(),
        })
      } catch (err) {
        console.error('SEND_MESSAGE error:', err.message)
      }
    })

    // ── TYPING ──────────────────────────────────────────────────────────────
    socket.on(EVENTS.TYPING_START, ({ roomId }) => {
      socket.to(roomId).emit(EVENTS.TYPING_START, { userId: socket.user.id, name: socket.user.name })
    })
    socket.on(EVENTS.TYPING_STOP, ({ roomId }) => {
      socket.to(roomId).emit(EVENTS.TYPING_STOP, { userId: socket.user.id })
    })

    // ── WebRTC signaling relay ───────────────────────────────────────────────
    socket.on(EVENTS.WEBRTC_SIGNAL, ({ to, signal, type }) => {
      // Find the target socket by user ID
      const target = [...io.sockets.sockets.values()].find(s => s.user?.id === to)
      if (target) {
        target.emit(EVENTS.WEBRTC_SIGNAL, {
          from: socket.user.id,
          fromName: socket.user.name,
          signal,
          type,
        })
      } else {
        console.warn(`WebRTC: target user ${to} not found`)
      }
    })

    // ── FILE events ─────────────────────────────────────────────────────────
    socket.on(EVENTS.FILE_CREATED, ({ roomId, file }) => socket.to(roomId).emit(EVENTS.FILE_CREATED, file))
    socket.on(EVENTS.FILE_DELETED, ({ roomId, fileId }) => socket.to(roomId).emit(EVENTS.FILE_DELETED, { fileId }))

    // ── LEAVE_ROOM (explicit, e.g. clicking Leave) ───────────────────────────
    socket.on(EVENTS.LEAVE_ROOM, ({ roomId }) => {
      socket.leave(roomId)
      // Explicit leave — always notify
      socket.to(roomId).emit(EVENTS.USER_LEFT, socket.user)
      io.in(roomId).fetchSockets().then(sockets => {
        io.to(roomId).emit(EVENTS.ROOM_USERS, sockets.map(s => s.user).filter(Boolean))
      })
    })

    // ── DISCONNECT ───────────────────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      console.log(`✘ Disconnected: ${socket.user?.name} (${reason})`)
      if (!socket.currentRoom) return

      const roomId = socket.currentRoom
      const key = `${socket.user.id}_${roomId}`

      // Mark as recently disconnected
      recentDisconnects.set(key, Date.now())

      // Wait grace period — if they reconnect, they'll delete from map and we won't fire USER_LEFT
      setTimeout(async () => {
        if (recentDisconnects.has(key)) {
          // Still in map = did NOT reconnect = truly left
          recentDisconnects.delete(key)
          socket.to(roomId).emit(EVENTS.USER_LEFT, socket.user)
          try {
            const sockets = await io.in(roomId).fetchSockets()
            io.to(roomId).emit(EVENTS.ROOM_USERS, sockets.map(s => s.user).filter(Boolean))
          } catch {}
        }
      }, RECONNECT_GRACE_MS)
    })
  })

  // Clean up stale reconnect entries every 30s
  setInterval(() => {
    const now = Date.now()
    for (const [key, ts] of recentDisconnects.entries()) {
      if (now - ts > RECONNECT_GRACE_MS * 2) recentDisconnects.delete(key)
    }
  }, 30000)
}

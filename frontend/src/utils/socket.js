import { io } from 'socket.io-client'

let socket = null

export const getSocket = () => socket

export const initSocket = (token) => {
  if (socket) socket.disconnect()
  const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001'
  socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  })
  return socket
}

export const disconnectSocket = () => {
  if (socket) { socket.disconnect(); socket = null }
}

// Emit helpers used by WorkspacePage
export const emitCodeChange = (roomId, fileId, content) => {
  socket?.emit(EVENTS.CODE_CHANGE, { roomId, fileId, content })
}
export const emitCursorMove = (roomId, fileId, pos) => {
  socket?.emit(EVENTS.CURSOR_MOVE, { roomId, fileId, line: pos.lineNumber, col: pos.column })
}
export const emitSendMessage = (roomId, message) => {
  socket?.emit(EVENTS.SEND_MESSAGE, { roomId, message })
}
export const emitTypingStart = (roomId) => {
  socket?.emit(EVENTS.TYPING_START, { roomId })
}
export const emitTypingStop = (roomId) => {
  socket?.emit(EVENTS.TYPING_STOP, { roomId })
}
export const emitWhiteboardDraw = (roomId, data) => {
  socket?.emit('WHITEBOARD_DRAW', { roomId, ...data })
}
export const emitWhiteboardClear = (roomId) => {
  socket?.emit('WHITEBOARD_CLEAR', { roomId })
}

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

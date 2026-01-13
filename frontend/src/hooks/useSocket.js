import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { initSocket, disconnectSocket, EVENTS } from '../utils/socket'
import {
  addUser, removeUser, setOnlineUsers,
  updateFileContent, addFile, removeFile,
  addMessage, setMessages,
} from '../store/slices/workspaceSlice'
import { updateCursor, removeCursor, setTypingUsers } from '../store/slices/uiSlice'
import { setCode } from '../store/slices/editorSlice'
import { toast } from 'react-toastify'

export const useSocket = (workspaceId) => {
  const dispatch = useDispatch()
  const { token } = useSelector((s) => s.auth)
  const activeFileIdRef = useRef(null)
  const socketRef = useRef(null)

  // Keep ref in sync so the connect handler always has latest fileId
  const { activeFileId } = useSelector((s) => s.editor)
  useEffect(() => { activeFileIdRef.current = activeFileId }, [activeFileId])

  useEffect(() => {
    if (!token || !workspaceId) return

    const socket = initSocket(token)
    socketRef.current = socket

    socket.on('connect', () => {
      // Send current fileId so server can sync code immediately
      socket.emit(EVENTS.JOIN_ROOM, {
        roomId: workspaceId,
        fileId: activeFileIdRef.current,
      })
    })

    socket.on('reconnect', () => {
      socket.emit(EVENTS.JOIN_ROOM, {
        roomId: workspaceId,
        fileId: activeFileIdRef.current,
      })
    })

    // Server sends code when joining — update editor
    socket.on(EVENTS.SYNC_CODE, ({ fileId, content }) => {
      if (content) dispatch(setCode(content))
    })

    socket.on(EVENTS.ROOM_USERS, (users) => dispatch(setOnlineUsers(users)))

    socket.on(EVENTS.USER_JOINED, (user) => {
      dispatch(addUser(user))
      toast.info(`👋 ${user.name} joined`, { toastId: `join-${user.id}`, autoClose: 3000 })
    })

    socket.on(EVENTS.USER_LEFT, (user) => {
      dispatch(removeUser(user))
      dispatch(removeCursor(user.id))
      toast.info(`👋 ${user.name} left`, { toastId: `left-${user.id}`, autoClose: 3000 })
    })

    socket.on(EVENTS.MESSAGE_HISTORY, (msgs) => dispatch(setMessages(msgs)))
    socket.on(EVENTS.RECEIVE_MESSAGE, (msg) => dispatch(addMessage(msg)))

    socket.on(EVENTS.CODE_CHANGE, ({ fileId, content }) => {
      dispatch(updateFileContent({ id: fileId, content }))
      // Only update editor if the changed file is currently active
      if (fileId === activeFileIdRef.current) {
        dispatch(setCode(content))
      }
    })

    socket.on(EVENTS.CURSOR_UPDATE, (data) => dispatch(updateCursor(data)))
    socket.on(EVENTS.TYPING_START, ({ userId, name }) => dispatch(setTypingUsers([{ userId, name }])))
    socket.on(EVENTS.TYPING_STOP, () => dispatch(setTypingUsers([])))
    socket.on(EVENTS.FILE_CREATED, (file) => dispatch(addFile(file)))
    socket.on(EVENTS.FILE_DELETED, ({ fileId }) => dispatch(removeFile(fileId)))

    socket.on('WORKSPACE_INVITE', ({ workspaceId, workspaceName, inviterName, role }) => {
      toast.info(
        `🚀 ${inviterName} invited you to "${workspaceName}"`,
        {
          autoClose: 8000,
          onClick: () => window.location.href = `/workspace/${workspaceId}`,
          style: { cursor: 'pointer' }
        }
      )
    })

    socket.on('connect_error', (err) => {
      console.error('Socket connect error:', err.message)
    })

    return () => {
      // Emit explicit leave so server knows this is intentional (nav away)
      socket.emit(EVENTS.LEAVE_ROOM, { roomId: workspaceId })
      disconnectSocket()
    }
  }, [workspaceId, token])

  return socketRef
}

export default useSocket

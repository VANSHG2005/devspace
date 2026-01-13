import { useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { setSavedStatus } from '../store/slices/editorSlice'
import api from '../utils/api'

export const useAutoSave = (workspaceId, intervalMs = 4000) => {
  const dispatch = useDispatch()
  const { activeFileId, code } = useSelector((s) => s.editor)
  const timerRef = useRef(null)
  const lastSavedRef = useRef(null)

  useEffect(() => {
    // Reset last saved when file changes
    lastSavedRef.current = code
  }, [activeFileId])

  useEffect(() => {
    if (!activeFileId || !workspaceId) return
    if (code === lastSavedRef.current) return

    dispatch(setSavedStatus('unsaved'))
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      try {
        dispatch(setSavedStatus('saving'))
        await api.put(`/files/${activeFileId}`, { content: code })
        lastSavedRef.current = code
        dispatch(setSavedStatus('saved'))
      } catch {
        dispatch(setSavedStatus('error'))
      }
    }, intervalMs)

    return () => clearTimeout(timerRef.current)
  }, [code, activeFileId, workspaceId])
}

export default useAutoSave

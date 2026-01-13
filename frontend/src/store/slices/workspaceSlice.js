import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../utils/api'

export const fetchWorkspaces = createAsyncThunk('workspace/fetchAll', async (_, { rejectWithValue }) => {
  try { const { data } = await api.get('/workspaces'); return data }
  catch (err) { return rejectWithValue(err.response?.data?.error || 'Failed to fetch') }
})

export const createWorkspace = createAsyncThunk('workspace/create', async (payload, { rejectWithValue }) => {
  try { const { data } = await api.post('/workspaces', payload); return data }
  catch (err) { return rejectWithValue(err.response?.data?.error || 'Failed to create') }
})

export const fetchWorkspace = createAsyncThunk('workspace/fetchOne', async (id, { rejectWithValue }) => {
  try { const { data } = await api.get(`/workspaces/${id}`); return data }
  catch (err) { return rejectWithValue(err.response?.data?.error || 'Not found') }
})

export const deleteWorkspace = createAsyncThunk('workspace/delete', async (id, { rejectWithValue }) => {
  try { await api.delete(`/workspaces/${id}`); return id }
  catch (err) { return rejectWithValue(err.response?.data?.error || 'Failed to delete') }
})

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState: {
    workspaces: [],
    current: null,
    files: [],
    activeFile: null,
    onlineUsers: [],
    messages: [],
    versions: [],
    loading: false,
    error: null,
  },
  reducers: {
    setCurrentWorkspace: (state, action) => { state.current = action.payload },
    setFiles: (state, action) => { state.files = action.payload },
    setActiveFile: (state, action) => { state.activeFile = action.payload },
    addFile: (state, action) => { state.files.push(action.payload) },
    removeFile: (state, action) => { state.files = state.files.filter(f => f.id !== action.payload) },
    updateFileContent: (state, action) => {
      const f = state.files.find(f => f.id === action.payload.id)
      if (f) f.content = action.payload.content
      if (state.activeFile?.id === action.payload.id) state.activeFile.content = action.payload.content
    },
    setOnlineUsers: (state, action) => { state.onlineUsers = action.payload },
    addUser: (state, action) => {
      if (!state.onlineUsers.find(u => u.id === action.payload.id))
        state.onlineUsers.push(action.payload)
    },
    removeUser: (state, action) => {
      state.onlineUsers = state.onlineUsers.filter(u => u.id !== action.payload.id)
    },
    addMessage: (state, action) => {
      // Prevent duplicate messages by ID
      const exists = state.messages.find(m => m.id === action.payload.id)
      if (!exists) state.messages.push(action.payload)
    },
    setMessages: (state, action) => { state.messages = action.payload },
    setVersions: (state, action) => { state.versions = action.payload },
    clearWorkspace: (state) => {
      state.current = null; state.files = []; state.activeFile = null
      state.onlineUsers = []; state.messages = []
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWorkspaces.pending, (state) => { state.loading = true })
      .addCase(fetchWorkspaces.fulfilled, (state, action) => {
        state.loading = false
        state.workspaces = action.payload.workspaces || []
      })
      .addCase(fetchWorkspaces.rejected, (state) => { state.loading = false })
      .addCase(createWorkspace.fulfilled, (state, action) => {
        state.workspaces.unshift(action.payload.workspace)
      })
      .addCase(fetchWorkspace.fulfilled, (state, action) => {
        state.current = action.payload.workspace
      })
      .addCase(deleteWorkspace.fulfilled, (state, action) => {
        state.workspaces = state.workspaces.filter(w => w.id !== action.payload)
      })
  },
})

export const {
  setCurrentWorkspace, setFiles, setActiveFile, addFile, removeFile,
  updateFileContent, setOnlineUsers, addUser, removeUser,
  addMessage, setMessages, setVersions, clearWorkspace,
} = workspaceSlice.actions
export default workspaceSlice.reducer

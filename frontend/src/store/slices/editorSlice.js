import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../utils/api'

export const fetchFiles = createAsyncThunk('editor/fetchFiles', async (workspaceId, { rejectWithValue }) => {
  try {
    const { data } = await api.get(`/workspaces/${workspaceId}/files`)
    return data.files
  } catch (err) { return rejectWithValue(err.response?.data?.error) }
})

export const createFile = createAsyncThunk('editor/createFile', async ({ workspaceId, name, language }, { rejectWithValue }) => {
  try {
    const { data } = await api.post(`/workspaces/${workspaceId}/files`, { name, language })
    return data.file
  } catch (err) { return rejectWithValue(err.response?.data?.error) }
})

export const deleteFile = createAsyncThunk('editor/deleteFile', async ({ workspaceId, fileId }, { rejectWithValue }) => {
  try {
    await api.delete(`/files/${fileId}`)
    return fileId
  } catch (err) { return rejectWithValue(err.response?.data?.error) }
})

export const saveFile = createAsyncThunk('editor/saveFile', async ({ workspaceId, fileId, content }, { rejectWithValue }) => {
  try {
    const { data } = await api.put(`/files/${fileId}`, { content })
    return data.file
  } catch (err) { return rejectWithValue(err.response?.data?.error) }
})

export const fetchVersions = createAsyncThunk('editor/fetchVersions', async ({ workspaceId, fileId }, { rejectWithValue }) => {
  try {
    const { data } = await api.get(`/files/${fileId}/versions`)
    return data.versions
  } catch (err) { return rejectWithValue(err.response?.data?.error) }
})

export const restoreVersion = createAsyncThunk('editor/restoreVersion', async ({ workspaceId, fileId, versionId }, { rejectWithValue }) => {
  try {
    const { data } = await api.post(`/files/${fileId}/versions`, { versionId })
    return data
  } catch (err) { return rejectWithValue(err.response?.data?.error) }
})

export const executeCode = createAsyncThunk('editor/executeCode', async ({ code, language }, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/execute', { code, language })
    return data
  } catch (err) { return rejectWithValue(err.response?.data?.error || 'Execution failed') }
})

const editorSlice = createSlice({
  name: 'editor',
  initialState: {
    files: [],
    activeFileId: null,
    code: '',
    language: 'javascript',
    cursors: {},
    savedStatus: 'saved',
    versions: [],
    executionOutput: [],
    executionLoading: false,
    loading: false,
    error: null,
  },
  reducers: {
    setActiveFile: (state, action) => {
      state.activeFileId = action.payload.id
      state.code = action.payload.content || ''
      state.language = action.payload.language || 'javascript'
      state.executionOutput = []
    },
    setCode: (state, action) => {
      state.code = action.payload
      state.savedStatus = 'unsaved'
    },
    setSavedStatus: (state, action) => { state.savedStatus = action.payload },
    clearExecutionOutput: (state) => { state.executionOutput = [] },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFiles.fulfilled, (state, action) => {
        state.files = action.payload
        if (action.payload.length > 0) {
          // ALWAYS reset to first file on load — ensures content is shown after reload
          const first = action.payload[0]
          state.activeFileId = first.id
          state.code = first.content || ''
          state.language = first.language || 'javascript'
        }
      })
      .addCase(createFile.fulfilled, (state, action) => {
        state.files.push(action.payload)
        state.activeFileId = action.payload.id
        state.code = action.payload.content || ''
        state.language = action.payload.language || 'javascript'
      })
      .addCase(deleteFile.fulfilled, (state, action) => {
        state.files = state.files.filter(f => f.id !== action.payload)
        if (state.activeFileId === action.payload && state.files.length > 0) {
          state.activeFileId = state.files[0].id
          state.code = state.files[0].content || ''
          state.language = state.files[0].language || 'javascript'
        }
      })
      .addCase(saveFile.fulfilled, (state, action) => {
        const idx = state.files.findIndex(f => f.id === action.payload?.id)
        if (idx !== -1) state.files[idx] = action.payload
        state.savedStatus = 'saved'
      })
      .addCase(fetchVersions.fulfilled, (state, action) => { state.versions = action.payload })
      .addCase(restoreVersion.fulfilled, (state, action) => {
        if (action.payload?.content) {
          state.code = action.payload.content
          state.savedStatus = 'saved'
        }
      })
      .addCase(executeCode.pending, (state) => {
        state.executionLoading = true
        state.executionOutput = [{ type: 'info', text: 'Running...' }]
      })
      .addCase(executeCode.fulfilled, (state, action) => {
        state.executionLoading = false
        state.executionOutput = []
        if (action.payload.output) {
          state.executionOutput.push({ type: 'result', text: action.payload.output })
        }
        if (action.payload.error) {
          state.executionOutput.push({ type: 'error', text: action.payload.error })
        }
        if (!action.payload.output && !action.payload.error) {
          state.executionOutput.push({ type: 'result', text: '(no output)' })
        }
      })
      .addCase(executeCode.rejected, (state, action) => {
        state.executionLoading = false
        state.executionOutput = [{ type: 'error', text: action.payload || 'Execution failed' }]
      })
  },
})

export const { setActiveFile, setCode, setSavedStatus, clearExecutionOutput } = editorSlice.actions
export default editorSlice.reducer

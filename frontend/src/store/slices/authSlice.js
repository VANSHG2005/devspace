import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../../utils/api'

export const login = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/login', credentials)
    localStorage.setItem('token', data.token)
    localStorage.setItem('refreshToken', data.refreshToken)
    return data
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Login failed')
  }
})

export const signup = createAsyncThunk('auth/signup', async (userData, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/signup', userData)
    localStorage.setItem('token', data.token)
    localStorage.setItem('refreshToken', data.refreshToken)
    return data
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Signup failed')
  }
})

export const loadUser = createAsyncThunk('auth/loadUser', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get('/auth/me')
    return data
  } catch (err) {
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    return rejectWithValue('Session expired')
  }
})

export const updateProfile = createAsyncThunk('auth/updateProfile', async (profileData, { rejectWithValue }) => {
  try {
    const { data } = await api.patch('/auth/profile', profileData)
    return data
  } catch (err) {
    return rejectWithValue(err.response?.data?.error || 'Profile update failed')
  }
})

const token = localStorage.getItem('token')

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    token,
    loading: false,
    error: null,
    initialized: !token,
  },
  reducers: {
    logout: (state) => {
      state.user = null
      state.token = null
      state.initialized = true
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
    },
    clearError: (state) => { state.error = null },
    updateUser: (state, action) => { state.user = { ...state.user, ...action.payload } },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending,    (s) => { s.loading = true;  s.error = null })
      .addCase(login.fulfilled,  (s, a) => { s.loading = false; s.user = a.payload.user; s.token = a.payload.token; s.initialized = true })
      .addCase(login.rejected,   (s, a) => { s.loading = false; s.error = a.payload })
      .addCase(signup.pending,   (s) => { s.loading = true;  s.error = null })
      .addCase(signup.fulfilled, (s, a) => { s.loading = false; s.user = a.payload.user; s.token = a.payload.token; s.initialized = true })
      .addCase(signup.rejected,  (s, a) => { s.loading = false; s.error = a.payload })
      .addCase(loadUser.fulfilled, (s, a) => { s.user = a.payload.user; s.initialized = true })
      .addCase(loadUser.rejected,  (s) => { s.initialized = true; s.token = null; s.user = null })
      .addCase(updateProfile.pending,   (s) => { s.loading = true;  s.error = null })
      .addCase(updateProfile.fulfilled, (s, a) => { s.loading = false; s.user = a.payload.user })
      .addCase(updateProfile.rejected,  (s, a) => { s.loading = false; s.error = a.payload })
  },
})

export const { logout, clearError, updateUser } = authSlice.actions
export default authSlice.reducer

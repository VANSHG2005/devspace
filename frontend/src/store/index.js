import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import workspaceReducer from './slices/workspaceSlice'
import editorReducer from './slices/editorSlice'
import uiReducer from './slices/uiSlice'
import chatReducer from './slices/chatSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    workspace: workspaceReducer,
    editor: editorReducer,
    ui: uiReducer,
    chat: chatReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
})
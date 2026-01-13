import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import workspaceReducer from './slices/workspaceSlice';
import uiReducer from './slices/uiSlice';

export const store = configureStore({
  reducer: { auth: authReducer, workspace: workspaceReducer, ui: uiReducer },
  middleware: (def) => def({ serializableCheck: false }),
});

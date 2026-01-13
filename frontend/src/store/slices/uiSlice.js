import { createSlice } from '@reduxjs/toolkit';

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    darkMode: true,
    activePanel: 'chat',
    sidebarOpen: true,
    notifications: [],
    typingUsers: [],
    cursors: {},
    presenceMap: {},
  },
  reducers: {
    toggleDarkMode: (state) => { state.darkMode = !state.darkMode; },
    setActivePanel: (state, action) => { state.activePanel = action.payload; },
    toggleSidebar: (state) => { state.sidebarOpen = !state.sidebarOpen; },
    updateCursor: (state, action) => {
      state.cursors[action.payload.userId] = action.payload;
    },
    removeCursor: (state, action) => { delete state.cursors[action.payload]; },
    setTypingUsers: (state, action) => { state.typingUsers = action.payload; },
    updatePresence: (state, action) => {
      state.presenceMap[action.payload.userId] = action.payload.status;
    },
  },
});

export const {
  toggleDarkMode, setActivePanel, toggleSidebar,
  updateCursor, removeCursor, setTypingUsers, updatePresence,
} = uiSlice.actions;
export default uiSlice.reducer;

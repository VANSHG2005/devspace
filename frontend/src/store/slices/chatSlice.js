import { createSlice } from '@reduxjs/toolkit';

export const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    messages: [],
    typingUsers: [],
    unread: 0,
  },
  reducers: {
    addMessage: (state, action) => {
      state.messages.push(action.payload);
    },
    setMessages: (state, action) => {
      state.messages = action.payload;
    },
    setTypingUsers: (state, action) => {
      state.typingUsers = action.payload;
    },
    addTypingUser: (state, action) => {
      if (!state.typingUsers.find(u => u.id === action.payload.id)) {
        state.typingUsers.push(action.payload);
      }
    },
    removeTypingUser: (state, action) => {
      state.typingUsers = state.typingUsers.filter(u => u.id !== action.payload);
    },
    incrementUnread: (state) => { state.unread += 1; },
    clearUnread: (state) => { state.unread = 0; },
    clearMessages: (state) => { state.messages = []; state.typingUsers = []; },
  },
});

export const {
  addMessage, setMessages, setTypingUsers, addTypingUser,
  removeTypingUser, incrementUnread, clearUnread, clearMessages,
} = chatSlice.actions;
export default chatSlice.reducer;

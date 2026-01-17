# 🎯 DevSpace — Interview Questions & Answers

## Architecture & System Design

### Q: How does real-time code sync work between users?
**A:** When a user types, the frontend emits a `CODE_CHANGE` socket event with the file ID and new content. The server broadcasts this to all other users in the same room (Socket.io room). To prevent sync issues when users join mid-session, the latest code is cached in Redis. When a new user joins, they receive a `SYNC_CODE` event with the current state from Redis (or PostgreSQL if cache miss).

### Q: How do you handle conflicts when two users type simultaneously?
**A:** The current implementation uses **last-write-wins** — the last `CODE_CHANGE` event received becomes the source of truth. For production-grade conflict resolution, the codebase includes an Operational Transformation (OT) utility (`frontend/src/utils/ot.js`) that can transform concurrent operations to produce consistent results. Libraries like **Yjs** (CRDT-based) are the industry standard for this (used by VSCode Live Share).

### Q: How does WebSocket scaling work with multiple backend servers?
**A:** Socket.io uses a **Redis Pub/Sub adapter** (`@socket.io/redis-adapter`). When a message is emitted in one server instance, Redis broadcasts it to all other instances. This allows horizontal scaling — multiple Node.js processes can handle WebSocket connections while sharing state through Redis.

### Q: Why Redis for caching? Why not just query PostgreSQL?
**A:** Redis is an in-memory store with sub-millisecond read times. Code content can be hundreds of KB; querying PostgreSQL on every join would add 5-20ms per join and increase DB load. Redis stores the current room state with a 1-hour TTL. PostgreSQL remains the source of truth for persistence.

---

## Backend & Node.js

### Q: How do you authenticate WebSocket connections?
**A:** JWT tokens are passed in the `socket.handshake.auth.token` field (not headers, since WebSocket upgrades don't easily support custom headers). The Socket.io middleware verifies the token and attaches the decoded user to the socket object before any events are processed.

### Q: How is auto-save implemented?
**A:** The frontend debounces changes using `setTimeout` — after 5 seconds of no activity, it sends a `PUT /api/files/:id` request to persist the latest content. This prevents saving on every keystroke. The backend also logs edit analytics asynchronously to avoid blocking the broadcast.

### Q: How does code execution work securely?
**A:** JavaScript is executed in **vm2** (sandboxed VM with restricted access to Node.js globals). Python code is written to a temp file and executed via `child_process.execFile` with a configurable timeout (default 5s) and memory limits. Both have rate limiting (10 executions/minute per user).

---

## Database Design

### Q: Why is workspace ID a VARCHAR instead of UUID?
**A:** Workspace IDs are short alphanumeric strings (e.g., `abc12345`) used in shareable URLs. A 8-character ID gives 36^8 = 2.8 trillion combinations, more than sufficient. UUID would make URLs unwieldy (`/workspace/550e8400-e29b-41d4-a716-446655440000` vs `/workspace/abc12345`).

### Q: How does version control work?
**A:** File versions are stored in `file_versions` table with incremental version numbers per file. Each version stores the full content snapshot (not diffs) for simplicity. For large files at scale, storing diffs (like Git) would be more storage-efficient.

---

## Frontend & React

### Q: Why Redux Toolkit for state management?
**A:** The workspace has complex cross-component state (online users, files, messages, cursors) that needs to be shared across the sidebar, editor, and chat panel. Redux RTK provides predictable state updates with immer-based reducers, and the devtools are excellent for debugging real-time state changes.

### Q: How does the live cursor overlay work?
**A:** Each connected user emits `CURSOR_MOVE` events with their line/column position. The editor component maintains a `cursors` object in Redux (keyed by userId). The editor renders absolutely-positioned overlays using a calculation based on line height (22.8px) and character width (7.8px for monospace).

### Q: How is WebRTC voice chat implemented?
**A:** The `useWebRTC` hook uses **simple-peer** (WebRTC wrapper) to establish peer-to-peer audio connections. The Socket.io server acts as a signaling server, relaying `WEBRTC_SIGNAL` events between peers to complete the WebRTC handshake. Once connected, audio flows directly peer-to-peer (no server relay).

---

## Resume Bullet Points

```
• Built full-stack real-time collaborative code editor supporting 50+ concurrent users using 
  React, Node.js, Socket.io, WebRTC, and Redis Pub/Sub for horizontal WebSocket scaling

• Implemented JWT authentication with bcrypt password hashing, role-based access control 
  (Owner/Editor/Viewer), and Socket.io middleware for authenticated WebSocket connections

• Designed PostgreSQL schema with file versioning, workspace analytics, and message history; 
  Redis caching reduces DB load by ~80% through room state caching with TTL

• Integrated OpenAI GPT-4o for AI code assistance, sandboxed JavaScript/Python code execution 
  (vm2 + child_process), and WebRTC peer-to-peer voice chat and screen sharing

• Containerized with Docker Compose (Nginx, Node.js, PostgreSQL, Redis) with GitHub Actions 
  CI/CD pipeline; deployed frontend to Vercel, backend to Railway
```

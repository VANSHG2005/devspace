-- DevSpace — Real-Time Collaborative Workspace
-- PostgreSQL 15 Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  color       VARCHAR(7) DEFAULT '#7c6af7',
  avatar      VARCHAR(4),
  avatar_url  TEXT,
  last_seen   TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Workspaces ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id          VARCHAR(20) PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  description TEXT DEFAULT '',
  owner_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  is_public   BOOLEAN DEFAULT false,
  settings    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Workspace Members (roles) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id  VARCHAR(20) REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  role          VARCHAR(20) DEFAULT 'editor' CHECK (role IN ('owner','editor','viewer')),
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

-- ─── Files ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS files (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  VARCHAR(20) REFERENCES workspaces(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  content       TEXT DEFAULT '',
  language      VARCHAR(50) DEFAULT 'javascript',
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── File Versions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS file_versions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id       UUID REFERENCES files(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  version_num   INTEGER NOT NULL,
  saved_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  message       TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Messages ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  VARCHAR(20) REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Analytics ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_analytics (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  VARCHAR(20) REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type    VARCHAR(50) NOT NULL,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_files_workspace ON files(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_workspace ON messages(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_workspace ON workspace_analytics(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_versions_file ON file_versions(file_id, version_num DESC);
CREATE INDEX IF NOT EXISTS idx_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─── Seed data ────────────────────────────────────────────────────────────────
-- (Optional: insert a test user for development)
-- INSERT INTO users (id,name,email,password,color,avatar)
-- VALUES (uuid_generate_v4(),'Test User','test@devspace.io','$2a$12$hashedpassword','#7c6af7','TU')
-- ON CONFLICT DO NOTHING;

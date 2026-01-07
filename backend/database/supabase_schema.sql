-- ═══════════════════════════════════════════════════════════════════════════
-- DevSpace — Supabase Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable UUID extension (already on by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Drop tables if re-running (safe for dev) ────────────────────────────────
DROP TABLE IF EXISTS workspace_analytics CASCADE;
DROP TABLE IF EXISTS file_versions       CASCADE;
DROP TABLE IF EXISTS messages            CASCADE;
DROP TABLE IF EXISTS files               CASCADE;
DROP TABLE IF EXISTS workspace_members   CASCADE;
DROP TABLE IF EXISTS workspaces          CASCADE;
DROP TABLE IF EXISTS users               CASCADE;

-- ─── users ───────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password    TEXT         NOT NULL,           -- bcrypt hash
  color       VARCHAR(7)   DEFAULT '#7c6af7',
  avatar      VARCHAR(4),                       -- initials e.g. "AC"
  avatar_url  TEXT,
  last_seen   TIMESTAMPTZ  DEFAULT NOW(),
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── workspaces ──────────────────────────────────────────────────────────────
CREATE TABLE workspaces (
  id          VARCHAR(20)  PRIMARY KEY,         -- short human-readable ID e.g. "abc12345"
  name        VARCHAR(200) NOT NULL,
  description TEXT         DEFAULT '',
  owner_id    UUID         REFERENCES users(id) ON DELETE CASCADE,
  is_public   BOOLEAN      DEFAULT false,
  settings    JSONB        DEFAULT '{}',
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── workspace_members (roles: owner / editor / viewer) ──────────────────────
CREATE TABLE workspace_members (
  workspace_id  VARCHAR(20) REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID        REFERENCES users(id)       ON DELETE CASCADE,
  role          VARCHAR(20) DEFAULT 'editor'
                            CHECK (role IN ('owner','editor','viewer')),
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

-- ─── files ───────────────────────────────────────────────────────────────────
CREATE TABLE files (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  VARCHAR(20)  REFERENCES workspaces(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  content       TEXT         DEFAULT '',
  language      VARCHAR(50)  DEFAULT 'javascript',
  created_by    UUID         REFERENCES users(id) ON DELETE SET NULL,
  deleted_at    TIMESTAMPTZ,                     -- soft delete
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── file_versions (named snapshots / restore points) ────────────────────────
CREATE TABLE file_versions (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id     UUID        REFERENCES files(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  version_num INTEGER     NOT NULL,
  saved_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  message     TEXT        DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── messages (workspace chat) ───────────────────────────────────────────────
CREATE TABLE messages (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  VARCHAR(20) REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID        REFERENCES users(id) ON DELETE SET NULL,
  content       TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── workspace_analytics ─────────────────────────────────────────────────────
CREATE TABLE workspace_analytics (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  VARCHAR(20) REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID        REFERENCES users(id) ON DELETE SET NULL,
  event_type    VARCHAR(50) NOT NULL,            -- 'join' | 'edit' | 'save' | etc.
  metadata      JSONB       DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes for performance ──────────────────────────────────────────────────
CREATE INDEX idx_files_workspace   ON files(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_messages_ws_time  ON messages(workspace_id, created_at DESC);
CREATE INDEX idx_analytics_ws      ON workspace_analytics(workspace_id, created_at DESC);
CREATE INDEX idx_versions_file     ON file_versions(file_id, version_num DESC);
CREATE INDEX idx_members_user      ON workspace_members(user_id);
CREATE INDEX idx_users_email       ON users(email);

-- ─── Row Level Security (RLS) ────────────────────────────────────────────────
-- We use service_role key server-side so RLS doesn't block our backend.
-- These policies protect direct browser/Supabase-JS access if you ever use it.

ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE files               ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_analytics ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS automatically — the following policies are
-- for any anon/authenticated Supabase client usage only.

-- Allow service role full access (backend uses this key)
CREATE POLICY "service_role_all" ON users               FOR ALL USING (true);
CREATE POLICY "service_role_all" ON workspaces          FOR ALL USING (true);
CREATE POLICY "service_role_all" ON workspace_members   FOR ALL USING (true);
CREATE POLICY "service_role_all" ON files               FOR ALL USING (true);
CREATE POLICY "service_role_all" ON file_versions       FOR ALL USING (true);
CREATE POLICY "service_role_all" ON messages            FOR ALL USING (true);
CREATE POLICY "service_role_all" ON workspace_analytics FOR ALL USING (true);

-- ─── Done ────────────────────────────────────────────────────────────────────
SELECT 'DevSpace Supabase schema created successfully ✅' AS status;

-- ─── ALTER users table to add profile fields ─────────────────────────────────
-- Run these in Supabase SQL Editor if upgrading an existing database:
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'email';

-- ─── Run these in Supabase SQL Editor to add new profile columns ─────────────
-- (Safe to run multiple times — IF NOT EXISTS)
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(20) DEFAULT 'email';

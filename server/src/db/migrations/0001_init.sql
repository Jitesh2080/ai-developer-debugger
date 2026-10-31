-- Initial schema for the AI Developer Debugger.
-- NOTE: __EMBEDDING_DIM__ is substituted at migrate time from EMBEDDING_DIMENSIONS
-- in .env, and must match the embedding model in OPENAI_EMBEDDING_MODEL
-- (1536 for OpenAI text-embedding-3-small; 768 for Ollama nomic-embed-text; etc.).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- Users (auth is deferred in the MVP; a single local user is seeded).
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

CREATE TABLE IF NOT EXISTS repositories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL DEFAULT 'github',
  url             TEXT NOT NULL,
  default_branch  TEXT NOT NULL DEFAULT 'main',
  local_path      TEXT,
  last_cloned_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repositories_project ON repositories(project_id);

CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'markdown', -- markdown | text | pdf
  byte_size   INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);

-- RAG chunks with their embeddings for semantic retrieval.
CREATE TABLE IF NOT EXISTS document_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content     TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding   VECTOR(__EMBEDDING_DIM__),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_project ON document_chunks(project_id);
-- Approximate-nearest-neighbour index for cosine similarity search.
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON document_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS debug_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | running | completed | failed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON debug_sessions(project_id);

CREATE TABLE IF NOT EXISTS errors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debug_session_id UUID NOT NULL REFERENCES debug_sessions(id) ON DELETE CASCADE,
  raw_text         TEXT NOT NULL,
  error_type       TEXT,
  technologies     TEXT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_errors_session ON errors(debug_session_id);

CREATE TABLE IF NOT EXISTS agent_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debug_session_id UUID NOT NULL REFERENCES debug_sessions(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL,
  model            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'running', -- running | completed | failed
  step_count       INTEGER NOT NULL DEFAULT 0,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_runs_session ON agent_runs(debug_session_id);

CREATE TABLE IF NOT EXISTS tool_calls (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  step_index   INTEGER NOT NULL,
  server_name  TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  arguments    JSONB NOT NULL DEFAULT '{}',
  result       JSONB,
  status       TEXT NOT NULL DEFAULT 'success', -- success | error
  duration_ms  INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_run ON tool_calls(agent_run_id);

CREATE TABLE IF NOT EXISTS solutions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debug_session_id UUID NOT NULL REFERENCES debug_sessions(id) ON DELETE CASCADE,
  root_cause       TEXT NOT NULL,
  suggested_fix    TEXT NOT NULL,
  affected_files   JSONB NOT NULL DEFAULT '[]',
  evidence         JSONB NOT NULL DEFAULT '[]',
  confidence       INTEGER NOT NULL DEFAULT 0, -- 0..100
  doc_references   JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_solutions_session ON solutions(debug_session_id);

-- Seed a single local user for the MVP (auth deferred).
INSERT INTO users (id, email, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'local@ai-debugger.dev', 'Local User')
ON CONFLICT (email) DO NOTHING;

-- Human-in-the-loop fix proposals. A proposal is generated from a diagnosis;
-- nothing is written to disk until a human approves (and only if write actions
-- are enabled). This keeps the system read-only by default.
CREATE TABLE IF NOT EXISTS fix_proposals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debug_session_id UUID NOT NULL REFERENCES debug_sessions(id) ON DELETE CASCADE,
  file_path        TEXT NOT NULL,
  original_content TEXT NOT NULL,
  proposed_content TEXT NOT NULL,
  explanation      TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected|applied
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_proposals_session ON fix_proposals(debug_session_id);

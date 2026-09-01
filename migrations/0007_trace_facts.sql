-- Separate user-confirmed facts from AI-authored narrative.
ALTER TABLE memories ADD COLUMN event_at TEXT;
ALTER TABLE memories ADD COLUMN date_precision TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE memories ADD COLUMN factual_summary TEXT;
ALTER TABLE memories ADD COLUMN people_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE memories ADD COLUMN latitude REAL;
ALTER TABLE memories ADD COLUMN longitude REAL;
ALTER TABLE memories ADD COLUMN facts_confirmed_at TEXT;
ALTER TABLE memories ADD COLUMN ai_source TEXT;
ALTER TABLE memories ADD COLUMN ai_model TEXT;
ALTER TABLE memories ADD COLUMN ai_generated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_memories_user_event_at
  ON memories(user_id, event_at DESC);

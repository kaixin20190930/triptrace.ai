-- TripTrace.ai early feedback inbox

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  page TEXT,
  contact TEXT,
  context TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status_created_at ON feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id_created_at ON feedback(user_id, created_at DESC);

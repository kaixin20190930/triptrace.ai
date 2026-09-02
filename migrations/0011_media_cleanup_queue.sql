-- Durable retry queue for private media that could not be deleted (PA-108).
--
-- Deleting a trace removes the database row immediately, which is what makes the media
-- unreachable through the API. The R2 delete is a separate call that can fail. Before this
-- table, such a failure was reported once in the response and then forgotten, leaving an
-- object in the bucket with nothing tracking it. That is both a cost leak and a weaker
-- privacy guarantee than the product promises.

CREATE TABLE IF NOT EXISTS media_cleanup_queue (
  media_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  memory_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- Retries are not attempted before this time, which spaces out a failing dependency.
  next_attempt_at TEXT NOT NULL,
  -- Set when the queue gives up, so a stuck key stays visible instead of retrying forever.
  abandoned_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_media_cleanup_queue_next_attempt
  ON media_cleanup_queue(next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_media_cleanup_queue_user
  ON media_cleanup_queue(user_id);

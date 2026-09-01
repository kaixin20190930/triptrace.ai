CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  anonymous_id TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  properties_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name_received_at
  ON analytics_events(event_name, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_received_at
  ON analytics_events(user_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_anonymous_received_at
  ON analytics_events(anonymous_id, received_at DESC);

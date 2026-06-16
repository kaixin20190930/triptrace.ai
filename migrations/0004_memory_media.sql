ALTER TABLE memories ADD COLUMN photo_keys_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE memories ADD COLUMN cover_photo_key TEXT;

CREATE INDEX IF NOT EXISTS idx_memories_cover_photo_key ON memories(cover_photo_key);

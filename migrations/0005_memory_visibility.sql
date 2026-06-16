-- Add is_public flag to memories so users can save private memories to their vault
-- Default 1 (public) to preserve existing records in the community feed
ALTER TABLE memories ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1;

-- Index to make feed queries fast (only public memories)
CREATE INDEX IF NOT EXISTS idx_memories_is_public_created_at ON memories(is_public, created_at DESC);

-- Personal memories are private unless a user explicitly publishes them.
ALTER TABLE memories ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;

-- Index to make feed queries fast (only public memories)
CREATE INDEX IF NOT EXISTS idx_memories_is_public_created_at ON memories(is_public, created_at DESC);

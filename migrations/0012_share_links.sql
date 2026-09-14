-- Selected-trace share links with revocation (M3-005, M3-006).
--
-- Sharing is the one deliberate hole in a private-by-default product, so it is scoped as
-- narrowly as possible: a link grants read access to exactly one trace, it is created only
-- by an explicit action, and it can be revoked at any time.
--
-- The token is stored as a SHA-256 hash rather than in the clear. A dump of this table then
-- yields no working URLs. Lookup still works because the hash is unsalted and therefore
-- deterministic. `token_prefix` is a short non-secret fragment kept only so the owner can
-- tell one link from another in the interface.

CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TEXT,
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_share_links_memory ON share_links(memory_id);
CREATE INDEX IF NOT EXISTS idx_share_links_user ON share_links(user_id);
CREATE INDEX IF NOT EXISTS idx_share_links_active ON share_links(token_hash, revoked_at);

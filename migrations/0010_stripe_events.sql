-- Stripe webhook idempotency ledger and subscription lookup index (PA-405 to PA-410).
--
-- Stripe retries webhooks and can deliver the same event more than once. Recording every
-- event id makes replays harmless: a duplicate is acknowledged without being applied twice.

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_received_at
  ON stripe_events(received_at DESC);

-- Webhooks identify the account by Stripe customer id, so that lookup must be indexed.
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_customer
  ON subscriptions(provider_customer_id);

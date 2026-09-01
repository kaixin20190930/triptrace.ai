-- Server-side plan entitlements and usage metering (PA-401 to PA-404).
-- Plans are enforced in `src/lib/server/entitlements.ts`; the UI only renders the result.

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  plan_key TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_subscription
  ON subscriptions(provider_subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status_plan
  ON subscriptions(status, plan_key);

-- `user_id` holds a signed-in user id, or a `guest:<hash>` subject for anonymous demo metering.
-- `period_key` is `YYYY-MM` in UTC for monthly metrics and `lifetime` for one-time allowances.
CREATE TABLE IF NOT EXISTS usage_counters (
  user_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, period_key, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_period_metric
  ON usage_counters(period_key, metric_key);

CREATE INDEX IF NOT EXISTS idx_usage_counters_updated_at
  ON usage_counters(updated_at);

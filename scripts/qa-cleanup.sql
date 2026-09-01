-- Removes only the throwaway accounts and metering rows created by
-- `scripts/api-entitlement-tests.mjs`. Safe to run repeatedly.
-- Apply with: npm run qa:cleanup
DELETE FROM comments WHERE memory_id IN (
  SELECT id FROM memories WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE 'qa-entitlements-%' OR email LIKE 'qa-gen-quota-%'
  )
);
DELETE FROM memories WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'qa-entitlements-%' OR email LIKE 'qa-gen-quota-%'
);
DELETE FROM sessions WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'qa-entitlements-%' OR email LIKE 'qa-gen-quota-%'
);
DELETE FROM subscriptions WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'qa-entitlements-%' OR email LIKE 'qa-gen-quota-%'
);
DELETE FROM usage_counters WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'qa-entitlements-%' OR email LIKE 'qa-gen-quota-%'
);
DELETE FROM analytics_events WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'qa-entitlements-%' OR email LIKE 'qa-gen-quota-%'
);
DELETE FROM users WHERE email LIKE 'qa-entitlements-%' OR email LIKE 'qa-gen-quota-%';
DELETE FROM usage_counters WHERE user_id LIKE 'guest:%';
DELETE FROM rate_limits WHERE bucket_key LIKE 'generate_memory%';

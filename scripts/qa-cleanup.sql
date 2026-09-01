-- Removes only the throwaway accounts and rows created by the automated test scripts.
-- Safe to run repeatedly. Local development database only: `npm run qa:cleanup` passes
-- `--local`, and this must never be pointed at production.
--
-- Test accounts always use an `@example.invalid` address prefixed with `qa-`, which is a
-- reserved TLD and therefore cannot collide with a real user.

DELETE FROM comments WHERE memory_id IN (
  SELECT id FROM memories WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE 'qa-%@example.invalid'
  )
);
DELETE FROM memories WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'qa-%@example.invalid'
);
DELETE FROM sessions WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'qa-%@example.invalid'
);
DELETE FROM subscriptions WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'qa-%@example.invalid'
);
DELETE FROM usage_counters WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'qa-%@example.invalid'
);
DELETE FROM analytics_events WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'qa-%@example.invalid'
);
DELETE FROM users WHERE email LIKE 'qa-%@example.invalid';

DELETE FROM usage_counters WHERE user_id LIKE 'guest:%';
DELETE FROM rate_limits WHERE bucket_key LIKE 'generate_memory%';
DELETE FROM rate_limits WHERE bucket_key LIKE 'billing_%';
-- Local webhook fixtures only; the billing tests are the only source of these rows here.
DELETE FROM stripe_events;

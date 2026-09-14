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
-- Must run before the users delete, since it resolves accounts through that table.
DELETE FROM media_cleanup_queue WHERE user_id IN (
  SELECT id FROM users WHERE email LIKE 'qa-%@example.invalid'
);
DELETE FROM users WHERE email LIKE 'qa-%@example.invalid';

DELETE FROM media_cleanup_queue WHERE media_key LIKE 'users/guard/%';

DELETE FROM usage_counters WHERE user_id LIKE 'guest:%';
-- Rate limit buckets are ephemeral infrastructure state, not user data. Leaving them behind
-- makes a second test run in the same hour fail against limits the first run consumed.
DELETE FROM rate_limits;
-- Local webhook fixtures only; the billing tests are the only source of these rows here.
DELETE FROM stripe_events;

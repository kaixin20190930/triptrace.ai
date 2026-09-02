// Retry and reporting for private media deletions that did not succeed (PA-108).
//
// The privacy contract is that deleting a trace makes its photos unreachable. Removing the
// database row achieves that immediately, because media access is authorised by looking up
// a referencing trace. The R2 object still has to be removed, though, or the bucket keeps
// paying for and storing a file the user believes is gone. This module makes that second
// step durable instead of best-effort-and-forget.

import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

/**
 * Attempts before a key is set aside for a human to look at.
 *
 * Twelve attempts under the backoff below span roughly 58 hours, so a key survives a
 * multi-day storage problem rather than being abandoned after an afternoon.
 */
export const MAX_CLEANUP_ATTEMPTS = 12;

/** Keys processed per sweep, so a single request never does unbounded work. */
export const CLEANUP_BATCH_SIZE = 25;

/**
 * Exponential backoff with a one-day ceiling.
 *
 * Pure so the schedule can be asserted directly: a transient R2 problem should be retried
 * promptly, while a persistent one should not be hammered.
 */
export function backoffMs(attempts: number): number {
  const safeAttempts = Math.max(0, Math.floor(attempts));
  // The exponent is clamped only to keep the arithmetic finite. It is deliberately higher
  // than the attempt limit so the one-day ceiling is actually reachable rather than dead.
  const base = 60_000 * 2 ** Math.min(safeAttempts, 30);
  return Math.min(base, 86_400_000);
}

export function nextAttemptAt(attempts: number, now = Date.now()): string {
  return new Date(now + backoffMs(attempts)).toISOString();
}

export type CleanupQueueRow = {
  media_key: string;
  user_id: string;
  memory_id: string | null;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  abandoned_at: string | null;
};

/**
 * Records keys that still need deleting.
 *
 * `ON CONFLICT DO NOTHING` keeps an existing row's attempt count and schedule, so
 * re-enqueuing the same key cannot reset its backoff.
 */
export async function enqueueMediaCleanup(
  db: D1Database,
  input: { keys: string[]; userId: string; memoryId?: string | null; error?: string },
): Promise<number> {
  const keys = Array.from(new Set(input.keys.map((key) => String(key || "").trim()).filter(Boolean)));
  if (!keys.length) return 0;

  const now = new Date().toISOString();
  const firstRetry = nextAttemptAt(0);
  let queued = 0;

  for (const key of keys) {
    const result = await db
      .prepare(
        `INSERT INTO media_cleanup_queue (
           media_key, user_id, memory_id, attempts, last_error, created_at, updated_at, next_attempt_at
         )
         VALUES (?1, ?2, ?3, 0, ?4, ?5, ?5, ?6)
         ON CONFLICT(media_key) DO NOTHING`,
      )
      .bind(key, input.userId, input.memoryId ?? null, input.error ?? null, now, firstRetry)
      .run();
    queued += Number(result.meta?.changes || 0);
  }
  return queued;
}

async function dueKeys(db: D1Database, limit: number, userId?: string): Promise<CleanupQueueRow[]> {
  const now = new Date().toISOString();
  const statement = userId
    ? db
        .prepare(
          `SELECT media_key, user_id, memory_id, attempts, last_error, next_attempt_at, abandoned_at
           FROM media_cleanup_queue
           WHERE abandoned_at IS NULL AND next_attempt_at <= ?1 AND user_id = ?3
           ORDER BY next_attempt_at
           LIMIT ?2`,
        )
        .bind(now, limit, userId)
    : db
        .prepare(
          `SELECT media_key, user_id, memory_id, attempts, last_error, next_attempt_at, abandoned_at
           FROM media_cleanup_queue
           WHERE abandoned_at IS NULL AND next_attempt_at <= ?1
           ORDER BY next_attempt_at
           LIMIT ?2`,
        )
        .bind(now, limit);

  const rows = await statement.all<CleanupQueueRow>();
  return rows.results || [];
}

export type SweepResult = {
  attempted: number;
  deleted: number;
  rescheduled: number;
  abandoned: number;
};

/**
 * Retries due keys.
 *
 * A key is removed from the queue only after R2 accepts the delete. A key that is still
 * referenced by a surviving trace is dropped from the queue without deleting anything,
 * because that means the row was recreated or the enqueue was wrong, and deleting it would
 * break a live memory.
 */
export async function sweepMediaCleanup(
  db: D1Database,
  bucket: R2Bucket,
  options: { limit?: number; userId?: string } = {},
): Promise<SweepResult> {
  const limit = Math.max(1, Math.min(options.limit ?? CLEANUP_BATCH_SIZE, 200));
  const rows = await dueKeys(db, limit, options.userId);
  const result: SweepResult = { attempted: 0, deleted: 0, rescheduled: 0, abandoned: 0 };

  for (const row of rows) {
    result.attempted += 1;

    const stillReferenced = await db
      .prepare(
        `SELECT id FROM memories
         WHERE cover_photo_key = ?1
            OR EXISTS (
              SELECT 1 FROM json_each(memories.photo_keys_json) WHERE json_each.value = ?1
            )
         LIMIT 1`,
      )
      .bind(row.media_key)
      .first<{ id: string }>();

    if (stillReferenced) {
      await db.prepare("DELETE FROM media_cleanup_queue WHERE media_key = ?1").bind(row.media_key).run();
      continue;
    }

    try {
      await bucket.delete(row.media_key);
      await db.prepare("DELETE FROM media_cleanup_queue WHERE media_key = ?1").bind(row.media_key).run();
      result.deleted += 1;
    } catch (thrown) {
      const attempts = Number(row.attempts || 0) + 1;
      const message = thrown instanceof Error ? thrown.message.slice(0, 200) : "unknown_error";
      if (attempts >= MAX_CLEANUP_ATTEMPTS) {
        await db
          .prepare(
            `UPDATE media_cleanup_queue
             SET attempts = ?2, last_error = ?3, updated_at = ?4, abandoned_at = ?4
             WHERE media_key = ?1`,
          )
          .bind(row.media_key, attempts, message, new Date().toISOString())
          .run();
        result.abandoned += 1;
      } else {
        await db
          .prepare(
            `UPDATE media_cleanup_queue
             SET attempts = ?2, last_error = ?3, updated_at = ?4, next_attempt_at = ?5
             WHERE media_key = ?1`,
          )
          .bind(row.media_key, attempts, message, new Date().toISOString(), nextAttemptAt(attempts))
          .run();
        result.rescheduled += 1;
      }
    }
  }

  return result;
}

export type CleanupStats = {
  pending: number;
  due: number;
  abandoned: number;
  oldestPendingAt: string | null;
  maxAttempts: number;
};

/** Aggregates only. No media keys are exposed, since they identify private photos. */
export async function mediaCleanupStats(db: D1Database): Promise<CleanupStats> {
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN abandoned_at IS NULL THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN abandoned_at IS NULL AND next_attempt_at <= ?1 THEN 1 ELSE 0 END) AS due,
         SUM(CASE WHEN abandoned_at IS NOT NULL THEN 1 ELSE 0 END) AS abandoned,
         MIN(CASE WHEN abandoned_at IS NULL THEN created_at END) AS oldest,
         MAX(attempts) AS max_attempts
       FROM media_cleanup_queue`,
    )
    .bind(now)
    .first<{
      pending: number | null;
      due: number | null;
      abandoned: number | null;
      oldest: string | null;
      max_attempts: number | null;
    }>();

  return {
    pending: Number(row?.pending || 0),
    due: Number(row?.due || 0),
    abandoned: Number(row?.abandoned || 0),
    oldestPendingAt: row?.oldest ?? null,
    maxAttempts: Number(row?.max_attempts || 0),
  };
}

// Raw analytics retention.
//
// The privacy commitment recorded in the roadmap is that raw event rows live for at most
// 90 days. That promise is only real if something actually deletes them, so this module
// is the single place that defines and performs the cutoff.
import type { D1Database } from "@cloudflare/workers-types";

export const ANALYTICS_RETENTION_DAYS = 90;

/** Rows removed per call, so a single request never issues an unbounded delete. */
export const ANALYTICS_CLEANUP_BATCH = 500;

export function analyticsRetentionCutoff(now = new Date()): string {
  return new Date(now.getTime() - ANALYTICS_RETENTION_DAYS * 86_400_000).toISOString();
}

export async function countExpiredAnalyticsEvents(db: D1Database, cutoff: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM analytics_events WHERE received_at < ?1")
    .bind(cutoff)
    .first<{ count: number }>();
  return Number(row?.count || 0);
}

export type AnalyticsCleanupResult = {
  cutoff: string;
  deleted: number;
  /** Rows still older than the cutoff after this batch, so a caller can loop. */
  remaining: number;
};

/**
 * Delete one bounded batch of expired rows.
 *
 * The subselect form is used because `DELETE ... LIMIT` is not available on every SQLite
 * build, and an unbounded delete on a large table is exactly the kind of statement that
 * should not run inside a request.
 */
export async function deleteExpiredAnalyticsEvents(
  db: D1Database,
  options: { cutoff?: string; limit?: number } = {},
): Promise<AnalyticsCleanupResult> {
  const cutoff = options.cutoff || analyticsRetentionCutoff();
  const limit = Math.max(1, Math.min(options.limit ?? ANALYTICS_CLEANUP_BATCH, 5_000));

  const result = await db
    .prepare(
      `DELETE FROM analytics_events
       WHERE id IN (
         SELECT id FROM analytics_events
         WHERE received_at < ?1
         ORDER BY received_at
         LIMIT ?2
       )`,
    )
    .bind(cutoff, limit)
    .run();

  const deleted = Number(result.meta?.changes || 0);
  return { cutoff, deleted, remaining: await countExpiredAnalyticsEvents(db, cutoff) };
}

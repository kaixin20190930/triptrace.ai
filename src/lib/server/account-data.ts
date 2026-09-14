/**
 * Account data export and complete deletion (M3-007 and M3-008).
 *
 * Both are treated as rights rather than product features:
 *
 *  - Export is available on every plan, including Free, and is never gated behind payment.
 *    Charging someone to retrieve their own memories would contradict the promise that the
 *    content is theirs, and data portability is expected under GDPR and CCPA.
 *  - Deletion removes the account and its content rather than flagging it. Anything that
 *    cannot be deleted synchronously, which in practice means R2 objects, is queued so the
 *    removal still completes.
 */
import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { rowToMemory, safeParseArray, type MemoryRow } from "./memories";
import { enqueueMediaCleanup } from "./media-cleanup";
import type { SessionUser } from "./auth";

export const EXPORT_FORMAT_VERSION = 1;

/** Archive guards. Streaming keeps memory flat, but CRC work still costs CPU. */
export const MAX_ARCHIVE_FILES = 400;
export const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;

const MEMORY_COLUMNS = `memories.id, memories.title, memories.story, memories.place, memories.mood,
  memories.tags_json, memories.photo_keys_json, memories.cover_photo_key, memories.is_public,
  memories.created_at, memories.event_at, memories.date_precision, memories.factual_summary,
  memories.people_json, memories.latitude, memories.longitude, memories.facts_confirmed_at,
  memories.ai_source, memories.ai_model, memories.ai_generated_at,
  users.id AS user_id, users.display_name`;

export async function listOwnedMemoryRows(db: D1Database, userId: string): Promise<MemoryRow[]> {
  const rows = await db
    .prepare(
      `SELECT ${MEMORY_COLUMNS}
       FROM memories
       JOIN users ON users.id = memories.user_id
       WHERE memories.user_id = ?1
       ORDER BY COALESCE(memories.event_at, memories.created_at) ASC`,
    )
    .bind(userId)
    .all<MemoryRow>();
  return rows.results || [];
}

/** Every media key the account owns, deduplicated, in trace order. */
export function collectMediaKeys(rows: MemoryRow[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of [...safeParseArray(row.photo_keys_json), row.cover_photo_key]) {
      const clean = String(key || "").trim();
      if (!clean || seen.has(clean)) continue;
      seen.add(clean);
      keys.push(clean);
    }
  }
  return keys;
}

export type AccountExport = {
  formatVersion: number;
  exportedAt: string;
  /** Explains the structure inside the file, so the export is readable without our docs. */
  readme: string[];
  account: {
    id: string;
    email: string;
    displayName: string;
    createdAt: string;
  };
  plan: {
    key: string;
    status: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  };
  usage: Array<{ periodKey: string; metricKey: string; count: number }>;
  traces: ReturnType<typeof rowToMemory>[];
  media: Array<{ key: string; url: string; archivePath: string }>;
  /** The account's own analytics rows, which exist for at most the retention window. */
  activity: Array<{ eventName: string; occurredAt: string; properties: unknown }>;
};

/** Path a media key takes inside the archive, kept stable so the manifest can reference it. */
export function archivePathForKey(key: string): string {
  const name = key.split("/").filter(Boolean).slice(-2).join("-") || "photo";
  return `media/${name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}

export async function buildAccountExport(
  db: D1Database,
  user: SessionUser,
): Promise<AccountExport> {
  const rows = await listOwnedMemoryRows(db, user.id);

  const subscription = await db
    .prepare(
      `SELECT plan_key, status, current_period_end, cancel_at_period_end
       FROM subscriptions WHERE user_id = ?1`,
    )
    .bind(user.id)
    .first<{
      plan_key: string;
      status: string;
      current_period_end: string | null;
      cancel_at_period_end: number;
    }>();

  const usage = await db
    .prepare(
      `SELECT period_key, metric_key, count FROM usage_counters
       WHERE user_id = ?1 ORDER BY period_key, metric_key`,
    )
    .bind(user.id)
    .all<{ period_key: string; metric_key: string; count: number }>();

  const activity = await db
    .prepare(
      `SELECT event_name, occurred_at, properties_json FROM analytics_events
       WHERE user_id = ?1 ORDER BY occurred_at ASC LIMIT 5000`,
    )
    .bind(user.id)
    .all<{ event_name: string; occurred_at: string; properties_json: string }>();

  const mediaKeys = collectMediaKeys(rows);

  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    readme: [
      "This is a complete export of your TripTrace.ai account.",
      "`traces` holds one entry per saved trace. Within each trace, the fields you confirmed",
      "yourself (eventAt, datePrecision, place, people, latitude, longitude, factualSummary)",
      "are kept separate from the AI-drafted narrative (title, story, tags), and `ai` records",
      "which model drafted it. That separation is deliberate: AI never rewrites your facts.",
      "`media` lists your photos. In the ZIP archive they are included under `archivePath`.",
      "In the JSON export they are referenced by `url`, which requires you to be signed in.",
      "`activity` holds your own product analytics rows, which are kept for at most 90 days.",
      "Nothing here is shared with anyone else. Your traces are private unless you made one public.",
    ],
    account: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      createdAt: user.created_at,
    },
    plan: {
      key: subscription?.plan_key ?? "free",
      status: subscription?.status ?? null,
      currentPeriodEnd: subscription?.current_period_end ?? null,
      cancelAtPeriodEnd: Number(subscription?.cancel_at_period_end || 0) === 1,
    },
    usage: (usage.results || []).map((row) => ({
      periodKey: row.period_key,
      metricKey: row.metric_key,
      count: Number(row.count || 0),
    })),
    traces: rows.map(rowToMemory),
    media: mediaKeys.map((key) => ({
      key,
      url: `/api/media?key=${encodeURIComponent(key)}`,
      archivePath: archivePathForKey(key),
    })),
    activity: (activity.results || []).map((row) => {
      let properties: unknown = {};
      try {
        properties = JSON.parse(row.properties_json || "{}");
      } catch {
        properties = {};
      }
      return { eventName: row.event_name, occurredAt: row.occurred_at, properties };
    }),
  };
}

export type DeletionResult = {
  traces: number;
  mediaDeleted: number;
  mediaQueued: number;
};

/**
 * Removes the account and everything attached to it.
 *
 * Order matters. Media is removed first so a failure there is still recorded against a
 * known user id, then the database rows go, and the user row goes last so nothing is left
 * orphaned if the request dies midway.
 *
 * Analytics rows for the account are deleted rather than anonymised. Keeping a pseudonymous
 * row after an erasure request is harder to defend than losing some funnel history, and the
 * product is early enough that the history is cheap.
 */
export async function deleteAccountData(
  db: D1Database,
  userId: string,
  bucket: R2Bucket | null,
): Promise<DeletionResult> {
  const rows = await listOwnedMemoryRows(db, userId);
  const mediaKeys = collectMediaKeys(rows);

  let mediaDeleted = 0;
  let mediaQueued = 0;
  if (mediaKeys.length && bucket) {
    try {
      await bucket.delete(mediaKeys);
      mediaDeleted = mediaKeys.length;
    } catch (thrown) {
      mediaQueued = await enqueueMediaCleanup(db, {
        keys: mediaKeys,
        userId,
        error: thrown instanceof Error ? thrown.message : "account_delete_media_failed",
      });
    }
  } else if (mediaKeys.length) {
    mediaQueued = await enqueueMediaCleanup(db, {
      keys: mediaKeys,
      userId,
      error: "media_bucket_unavailable",
    });
  }

  await db.prepare("DELETE FROM comments WHERE user_id = ?1").bind(userId).run();
  await db
    .prepare("DELETE FROM comments WHERE memory_id IN (SELECT id FROM memories WHERE user_id = ?1)")
    .bind(userId)
    .run();
  await db.prepare("DELETE FROM memories WHERE user_id = ?1").bind(userId).run();
  await db.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(userId).run();
  await db.prepare("DELETE FROM subscriptions WHERE user_id = ?1").bind(userId).run();
  await db.prepare("DELETE FROM usage_counters WHERE user_id = ?1").bind(userId).run();
  await db.prepare("DELETE FROM analytics_events WHERE user_id = ?1").bind(userId).run();
  await db.prepare("DELETE FROM users WHERE id = ?1").bind(userId).run();

  return { traces: rows.length, mediaDeleted, mediaQueued };
}

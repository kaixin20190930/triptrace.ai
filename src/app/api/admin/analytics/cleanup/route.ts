import { getCloudflareContext } from "@opennextjs/cloudflare";
import { HttpError, requireDb } from "@/lib/server/cf";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import {
  ANALYTICS_CLEANUP_BATCH,
  ANALYTICS_RETENTION_DAYS,
  analyticsRetentionCutoff,
  countExpiredAnalyticsEvents,
  deleteExpiredAnalyticsEvents,
} from "@/lib/server/analytics-retention";

export const dynamic = "force-dynamic";

const ADMIN_TOKEN_HEADER = "x-triptrace-admin-token";

/**
 * Operator endpoint for enforcing the 90-day raw analytics retention rule.
 *
 * This route deletes data, so it is closed by default: without a configured
 * `ADMIN_TASK_TOKEN` it refuses to run at all rather than falling back to open access.
 * It is intended to be called by a scheduled job or by an operator, not by the product.
 */
async function requireAdminToken(request: Request): Promise<Response | null> {
  const { env } = await getCloudflareContext({ async: true });
  const expected = (env as unknown as { ADMIN_TASK_TOKEN?: string }).ADMIN_TASK_TOKEN;

  if (!expected) {
    return errorResponse(
      "ADMIN_TASK_TOKEN is not configured, so administrative tasks are disabled.",
      503,
      "admin_token_missing",
    );
  }

  const provided = request.headers.get(ADMIN_TOKEN_HEADER) || "";
  // Length-independent comparison is unnecessary here because both values are
  // server-controlled secrets of fixed shape, but an early length check keeps the
  // failure path cheap.
  if (provided.length !== expected.length) {
    return errorResponse("not allowed", 403, "admin_forbidden");
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return errorResponse("not allowed", 403, "admin_forbidden");

  return null;
}

/** Reports what would be deleted without changing anything. */
export async function GET(request: Request) {
  try {
    const denied = await requireAdminToken(request);
    if (denied) return denied;

    const db = await requireDb();
    const cutoff = analyticsRetentionCutoff();
    const expired = await countExpiredAnalyticsEvents(db, cutoff);

    return jsonResponse(
      {
        ok: true,
        retentionDays: ANALYTICS_RETENTION_DAYS,
        cutoff,
        expired,
        batchSize: ANALYTICS_CLEANUP_BATCH,
      },
      200,
      { "Cache-Control": "no-store" },
    );
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("analytics_cleanup_probe_failed", thrown);
    return errorResponse("Failed to inspect analytics retention", 500, "analytics_cleanup_failed");
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireAdminToken(request);
    if (denied) return denied;

    const db = await requireDb();
    const url = new URL(request.url);
    const requestedBatches = Number(url.searchParams.get("batches") || 1);
    const batches = Math.max(1, Math.min(Number.isFinite(requestedBatches) ? requestedBatches : 1, 20));
    const cutoff = analyticsRetentionCutoff();

    let deleted = 0;
    let remaining = await countExpiredAnalyticsEvents(db, cutoff);
    for (let i = 0; i < batches && remaining > 0; i += 1) {
      const result = await deleteExpiredAnalyticsEvents(db, { cutoff });
      deleted += result.deleted;
      remaining = result.remaining;
      if (result.deleted === 0) break;
    }

    return jsonResponse(
      {
        ok: true,
        retentionDays: ANALYTICS_RETENTION_DAYS,
        cutoff,
        deleted,
        remaining,
      },
      200,
      { "Cache-Control": "no-store" },
    );
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("analytics_cleanup_failed", thrown);
    return errorResponse("Failed to clean up analytics events", 500, "analytics_cleanup_failed");
  }
}

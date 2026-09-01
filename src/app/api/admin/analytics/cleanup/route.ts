import { HttpError, requireDb } from "@/lib/server/cf";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { requireAdminToken } from "@/lib/server/admin-auth";
import {
  ANALYTICS_CLEANUP_BATCH,
  ANALYTICS_RETENTION_DAYS,
  analyticsRetentionCutoff,
  countExpiredAnalyticsEvents,
  deleteExpiredAnalyticsEvents,
} from "@/lib/server/analytics-retention";

export const dynamic = "force-dynamic";

/**
 * Operator endpoint for enforcing the 90-day raw analytics retention rule.
 *
 * This route deletes data, so it is closed by default: without a configured
 * `ADMIN_TASK_TOKEN` it refuses to run at all rather than falling back to open access.
 * It is intended to be called by a scheduled job or by an operator, not by the product.
 */

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

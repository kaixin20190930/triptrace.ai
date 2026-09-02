import type { R2Bucket } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { HttpError, requireDb } from "@/lib/server/cf";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { requireAdminToken } from "@/lib/server/admin-auth";
import {
  CLEANUP_BATCH_SIZE,
  MAX_CLEANUP_ATTEMPTS,
  mediaCleanupStats,
  sweepMediaCleanup,
} from "@/lib/server/media-cleanup";

export const dynamic = "force-dynamic";

/**
 * Operator visibility and retry for private media that failed to delete.
 *
 * `GET` reports aggregates only. Media keys are deliberately not returned: a key identifies
 * a specific private photo, and an operational report has no need for it.
 */
export async function GET(request: Request) {
  try {
    const denied = await requireAdminToken(request);
    if (denied) return denied;

    const db = await requireDb();
    const stats = await mediaCleanupStats(db);

    return jsonResponse(
      {
        ok: true,
        queue: stats,
        batchSize: CLEANUP_BATCH_SIZE,
        maxAttempts: MAX_CLEANUP_ATTEMPTS,
        // Abandoned keys have exhausted their retries and will not be tried again without
        // intervention, so a non-zero value here is the signal worth alerting on.
        needsAttention: stats.abandoned > 0,
      },
      200,
      { "Cache-Control": "no-store" },
    );
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("media_cleanup_stats_failed", thrown);
    return errorResponse("Failed to read the media cleanup queue", 500, "media_cleanup_stats_failed");
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireAdminToken(request);
    if (denied) return denied;

    const db = await requireDb();
    const { env } = await getCloudflareContext({ async: true });
    const bucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA;
    if (!bucket) {
      return errorResponse("MEDIA bucket is not configured", 500, "media_bucket_missing");
    }

    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") || CLEANUP_BATCH_SIZE);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : CLEANUP_BATCH_SIZE;

    const swept = await sweepMediaCleanup(db, bucket, { limit });
    const stats = await mediaCleanupStats(db);

    return jsonResponse({ ok: true, swept, queue: stats }, 200, { "Cache-Control": "no-store" });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("media_cleanup_sweep_failed", thrown);
    return errorResponse("Failed to sweep the media cleanup queue", 500, "media_cleanup_sweep_failed");
  }
}

import { HttpError, requireDb } from "@/lib/server/cf";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { requireAdminToken } from "@/lib/server/admin-auth";
import { ANALYTICS_RETENTION_DAYS, analyticsRetentionCutoff } from "@/lib/server/analytics-retention";

export const dynamic = "force-dynamic";

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = ANALYTICS_RETENTION_DAYS;

/**
 * Owner-only funnel counts.
 *
 * Returns aggregates only: event names, counts, and distinct visitor counts. No event
 * properties, story text, coordinates, or emails are exposed, so this stays safe to read
 * even though it covers every account.
 */
export async function GET(request: Request) {
  try {
    const denied = await requireAdminToken(request);
    if (denied) return denied;

    const db = await requireDb();
    const url = new URL(request.url);

    const requestedDays = Number(url.searchParams.get("days") || DEFAULT_WINDOW_DAYS);
    const days = Math.max(1, Math.min(Number.isFinite(requestedDays) ? requestedDays : DEFAULT_WINDOW_DAYS, MAX_WINDOW_DAYS));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const userId = url.searchParams.get("userId")?.trim() || null;

    const rows = userId
      ? await db
          .prepare(
            `SELECT event_name, COUNT(*) AS count, COUNT(DISTINCT anonymous_id) AS visitors
             FROM analytics_events
             WHERE received_at >= ?1 AND user_id = ?2
             GROUP BY event_name
             ORDER BY count DESC`,
          )
          .bind(since, userId)
          .all<{ event_name: string; count: number; visitors: number }>()
      : await db
          .prepare(
            `SELECT event_name, COUNT(*) AS count, COUNT(DISTINCT anonymous_id) AS visitors
             FROM analytics_events
             WHERE received_at >= ?1
             GROUP BY event_name
             ORDER BY count DESC`,
          )
          .bind(since)
          .all<{ event_name: string; count: number; visitors: number }>();

    const events = (rows.results || []).map((row) => ({
      eventName: row.event_name,
      count: Number(row.count || 0),
      visitors: Number(row.visitors || 0),
    }));

    const totals = await db
      .prepare(
        `SELECT COUNT(*) AS events,
                COUNT(DISTINCT anonymous_id) AS visitors,
                COUNT(DISTINCT user_id) AS accounts
         FROM analytics_events
         WHERE received_at >= ?1`,
      )
      .bind(since)
      .first<{ events: number; visitors: number; accounts: number }>();

    return jsonResponse(
      {
        ok: true,
        windowDays: days,
        since,
        retentionDays: ANALYTICS_RETENTION_DAYS,
        retentionCutoff: analyticsRetentionCutoff(),
        scope: userId ? "account" : "all",
        totals: {
          events: Number(totals?.events || 0),
          visitors: Number(totals?.visitors || 0),
          accounts: Number(totals?.accounts || 0),
        },
        events,
      },
      200,
      { "Cache-Control": "no-store" },
    );
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("analytics_summary_failed", thrown);
    return errorResponse("Failed to summarise analytics", 500, "analytics_summary_failed");
  }
}

import { getSessionUser } from "@/lib/server/auth";
import { HttpError, requireDb } from "@/lib/server/cf";
import { errorResponse } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { buildAccountExport } from "@/lib/server/account-data";

export const dynamic = "force-dynamic";

/**
 * Complete account export as JSON (M3-007).
 *
 * Available on every plan. Retrieving your own memories is a right, not a paid feature, so
 * this route deliberately does not consult the entitlement layer.
 */
export async function GET(request: Request) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, request);
    if (!user) return errorResponse("Authentication required", 401, "unauthorized");

    const throttled = await checkRateLimit(db, request, "account_export", 20, 60 * 60 * 1_000);
    if (throttled) return throttled;

    const payload = await buildAccountExport(db, user);
    const filename = `triptrace-export-${payload.exportedAt.slice(0, 10)}.json`;

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("account_export_failed", thrown);
    return errorResponse("Export failed", 500, "account_export_failed");
  }
}

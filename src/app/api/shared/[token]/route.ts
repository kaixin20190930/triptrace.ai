import { HttpError, requireDb } from "@/lib/server/cf";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { recordShareView, resolveShareToken, toSharedTrace } from "@/lib/server/share-links";

export const dynamic = "force-dynamic";

/**
 * Public read of a single shared trace.
 *
 * No session is involved: the token is the whole capability. It grants one trace and
 * nothing else, and the response is shaped by an allowlist so no owner detail travels with
 * it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const db = await requireDb();

    // Tokens are 128-bit so guessing is infeasible, but a limit keeps a scripted probe from
    // costing us anything.
    const throttled = await checkRateLimit(db, request, "share_view", 240, 60 * 60 * 1_000);
    if (throttled) return throttled;

    const resolved = await resolveShareToken(db, token);
    if (!resolved) {
      // One answer for unknown, revoked, and expired, so a caller cannot tell which.
      return errorResponse("This link is no longer available", 404, "share_link_unavailable");
    }

    await recordShareView(db, resolved.link.id);

    return jsonResponse({ ok: true, trace: toSharedTrace(resolved, token) }, 200, {
      // Never cached publicly: a revoked link has to stop working at once, and a shared
      // memory must not linger in a shared cache.
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("share_view_failed", thrown);
    return errorResponse("Failed to load the shared trace", 500, "share_view_failed");
  }
}

import { getSessionUser } from "@/lib/server/auth";
import { HttpError, requireDb } from "@/lib/server/cf";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { PLANS } from "@/lib/plans";
import {
  aiGenerationUsage,
  getEntitlements,
  permanentTraceUsage,
} from "@/lib/server/entitlements";

export const dynamic = "force-dynamic";

/**
 * Minimal plan and usage read model.
 *
 * This is a convenience surface for the UI. It is never the enforcement point:
 * every write route re-resolves entitlements from the database on its own.
 */
export async function GET(request: Request) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, request);
    const url = new URL(request.url);
    const guestId = url.searchParams.get("guestId");

    const entitlements = await getEntitlements(db, user, request, guestId);
    const [generations, traces] = await Promise.all([
      aiGenerationUsage(db, entitlements),
      permanentTraceUsage(db, entitlements),
    ]);

    return jsonResponse(
      {
        ok: true,
        plan: {
          key: entitlements.planKey,
          label: PLANS[entitlements.planKey].label,
          signedIn: entitlements.signedIn,
          aiGenerationPeriod: PLANS[entitlements.planKey].aiGenerationPeriod,
        },
        limits: entitlements.limits,
        usage: {
          aiGenerations: { ...generations, periodKey: entitlements.aiPeriodKey },
          permanentTraces: traces,
        },
        subscription: entitlements.subscription,
        canSavePermanentTraces: entitlements.signedIn && traces.remaining > 0,
      },
      200,
      { "Cache-Control": "no-store" },
    );
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("entitlements_read_failed", thrown);
    return errorResponse("Failed to read entitlements", 500, "entitlements_read_failed");
  }
}

import { getSessionUser } from "@/lib/server/auth";
import { HttpError, requireDb } from "@/lib/server/cf";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { createPortalSession, readSubscriptionForUser } from "@/lib/server/stripe";
import { readStripeConfig } from "@/lib/server/stripe-config";

export const dynamic = "force-dynamic";

/**
 * Opens the Stripe customer portal so a subscriber can update payment details or cancel
 * without asking us. Cancellation never removes access to existing memories; it only
 * returns the account to the Free allowance.
 */
export async function POST(request: Request) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, request);
    if (!user) return errorResponse("Authentication required", 401, "unauthorized");

    const throttled = await checkRateLimit(db, request, "billing_portal", 20, 60 * 60 * 1_000);
    if (throttled) return throttled;

    const config = await readStripeConfig();
    if (!config.secretKey) {
      return errorResponse("Billing is not available yet.", 503, "billing_not_configured");
    }

    const existing = await readSubscriptionForUser(db, user.id);
    if (!existing?.provider_customer_id) {
      return errorResponse(
        "This account has no billing history yet.",
        409,
        "billing_no_customer",
      );
    }

    const origin = new URL(request.url).origin;
    const session = await createPortalSession(config.secretKey, {
      customerId: existing.provider_customer_id,
      returnUrl: `${origin}/plan`,
    });

    if (!session.ok) {
      console.error("stripe_portal_failed", session.status, session.message);
      return errorResponse("The billing portal is unavailable right now.", 502, "billing_portal_failed");
    }

    return jsonResponse({ ok: true, url: session.data.url }, 200, { "Cache-Control": "no-store" });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("billing_portal_error", thrown);
    return errorResponse("The billing portal is unavailable.", 500, "billing_portal_failed");
  }
}

import { getSessionUser } from "@/lib/server/auth";
import { HttpError, requireDb } from "@/lib/server/cf";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";
import {
  checkoutConfigured,
  createCheckoutSession,
  priceForInterval,
  readSubscriptionForUser,
  type BillingInterval,
} from "@/lib/server/stripe";
import { readStripeConfig } from "@/lib/server/stripe-config";

export const dynamic = "force-dynamic";

/**
 * Starts a Founding Plus checkout.
 *
 * This route only hands the visitor to Stripe. It never writes a plan: entitlements
 * change when the verified webhook arrives, so an abandoned or spoofed checkout grants
 * nothing.
 */
export async function POST(request: Request) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, request);
    if (!user) return errorResponse("Authentication required", 401, "unauthorized");

    const throttled = await checkRateLimit(db, request, "billing_checkout", 10, 60 * 60 * 1_000);
    if (throttled) return throttled;

    // Input is validated before configuration is consulted. A malformed request is a
    // client error whether or not billing happens to be configured, and answering with
    // the configuration state instead would be a misleading error.
    const body = await readJson<{ interval?: string }>(request);
    const requested = String(body?.interval || "monthly");
    if (requested !== "monthly" && requested !== "annual") {
      return errorResponse("interval must be monthly or annual", 400, "invalid_interval");
    }
    const interval = requested as BillingInterval;

    const config = await readStripeConfig();
    if (!checkoutConfigured(config)) {
      return errorResponse(
        "Billing is not available yet.",
        503,
        "billing_not_configured",
      );
    }
    const priceId = priceForInterval(config, interval);
    if (!priceId) {
      return errorResponse(`The ${interval} plan is not available yet.`, 503, "billing_price_missing");
    }

    const existing = await readSubscriptionForUser(db, user.id);
    const origin = new URL(request.url).origin;

    const session = await createCheckoutSession(config.secretKey as string, {
      priceId,
      userId: user.id,
      email: user.email,
      customerId: existing?.provider_customer_id ?? null,
      successUrl: `${origin}/plan?checkout=success`,
      cancelUrl: `${origin}/plan?checkout=cancelled`,
    });

    if (!session.ok) {
      console.error("stripe_checkout_failed", session.status, session.message);
      return errorResponse(
        "Checkout could not be started. Please try again.",
        502,
        "billing_checkout_failed",
      );
    }

    return jsonResponse({ ok: true, url: session.data.url }, 200, { "Cache-Control": "no-store" });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("billing_checkout_error", thrown);
    return errorResponse("Checkout could not be started.", 500, "billing_checkout_failed");
  }
}

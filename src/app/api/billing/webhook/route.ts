import type { D1Database } from "@cloudflare/workers-types";
import type { SessionUser } from "@/lib/server/auth";
import { HttpError, requireDb } from "@/lib/server/cf";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { PAID_PLAN } from "@/lib/plans";
import { recordServerEvent } from "@/lib/server/analytics";
import { getEntitlements } from "@/lib/server/entitlements";
import {
  claimStripeEvent,
  completeStripeEvent,
  findUserIdForCustomer,
  linkStripeCustomer,
  mapStripeEvent,
  upsertSubscription,
  verifyStripeSignature,
  type MappedEvent,
  type StripeConfig,
  type StripeEventEnvelope,
} from "@/lib/server/stripe";
import { readStripeConfig } from "@/lib/server/stripe-config";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;

/**
 * Stripe webhook receiver.
 *
 * Order matters here and is deliberate:
 *  1. Reject anything whose signature does not verify, before reading any state.
 *  2. Claim the event id, so a replayed delivery is acknowledged without being applied.
 *  3. Resolve the account, then write only to `subscriptions`.
 *
 * Entitlements are never written here. They are derived from `subscriptions` on every
 * request, so a stale or missing webhook can only ever under-grant, never over-grant.
 */
export async function POST(request: Request) {
  try {
    const config = await readStripeConfig();
    if (!config.webhookSecret) {
      // Failing shut matters more than convenience: without a secret there is no way to
      // tell a real Stripe delivery from a forged one.
      return errorResponse("Billing webhooks are not configured.", 503, "billing_not_configured");
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return errorResponse("Webhook payload is too large", 413, "payload_too_large");
    }

    const signature = await verifyStripeSignature(
      config.webhookSecret,
      request.headers.get("stripe-signature"),
      rawBody,
    );
    if (!signature.ok) {
      return errorResponse("Invalid Stripe signature", 400, `stripe_${signature.reason}`);
    }

    let event: StripeEventEnvelope;
    try {
      event = JSON.parse(rawBody) as StripeEventEnvelope;
    } catch {
      return errorResponse("Invalid webhook payload", 400, "invalid_body");
    }

    const eventId = String(event.id || "").trim();
    const eventType = String(event.type || "").trim();
    if (!eventId || !eventType) {
      return errorResponse("Webhook is missing id or type", 400, "invalid_event");
    }

    const db = await requireDb();
    const claimed = await claimStripeEvent(db, eventId, eventType);
    if (!claimed) {
      // Already seen. Acknowledge so Stripe stops retrying.
      return jsonResponse({ ok: true, duplicate: true }, 200, { "Cache-Control": "no-store" });
    }

    try {
      const outcome = await applyEvent(db, config, mapStripeEvent(config, event));
      await completeStripeEvent(db, eventId, outcome.status, outcome.detail);
      return jsonResponse({ ok: true, applied: outcome.status === "applied" }, 200, {
        "Cache-Control": "no-store",
      });
    } catch (thrown) {
      console.error("stripe_webhook_handler_failed", eventType, thrown);
      // Release the idempotency claim so Stripe's retry can actually be processed.
      // Keeping the claim would turn a transient failure into permanent data loss.
      await db.prepare("DELETE FROM stripe_events WHERE id = ?1").bind(eventId).run();
      return errorResponse("Webhook handling failed", 500, "stripe_handler_failed");
    }
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("stripe_webhook_failed", thrown);
    return errorResponse("Webhook handling failed", 500, "stripe_handler_failed");
  }
}

type Outcome = { status: "applied" | "ignored"; detail?: string };

/**
 * The plan the entitlement layer would actually grant right now.
 *
 * Resolved through `getEntitlements` rather than read straight from the row, so a lapsed
 * period or a non-active status is reflected the same way the product sees it.
 */
async function effectivePlanKey(db: D1Database, userId: string) {
  const user = await db
    .prepare("SELECT id, email, display_name, created_at FROM users WHERE id = ?1")
    .bind(userId)
    .first<SessionUser>();
  if (!user) return "free";
  const entitlements = await getEntitlements(db, user, new Request("https://internal.invalid/"));
  return entitlements.planKey;
}

async function applyEvent(
  db: D1Database,
  config: Partial<StripeConfig>,
  mapped: MappedEvent,
): Promise<Outcome> {
  if (mapped.kind === "ignored") return { status: "ignored", detail: "unhandled_type" };

  const userId = await resolveUserId(db, mapped.userIdHint, mapped.customerId);
  if (!userId) return { status: "ignored", detail: "unknown_account" };

  if (mapped.kind === "checkout") {
    // The checkout event only links the Stripe customer to the account. The plan itself
    // arrives with the subscription event, which carries the authoritative price and
    // status. Because Stripe does not guarantee ordering, this must not write plan state.
    await linkStripeCustomer(db, {
      userId,
      customerId: mapped.customerId,
      subscriptionId: mapped.subscriptionId,
    });
    return { status: "applied", detail: "customer_linked" };
  }

  // Read the effective plan before writing, so the billing funnel records real
  // transitions instead of one event per Stripe update.
  const planBefore = await effectivePlanKey(db, userId);

  await upsertSubscription(db, {
    userId,
    planKey: mapped.planKey,
    status: mapped.status,
    customerId: mapped.customerId,
    subscriptionId: mapped.subscriptionId,
    currentPeriodEnd: mapped.currentPeriodEnd,
    cancelAtPeriodEnd: mapped.cancelAtPeriodEnd,
  });

  const planAfter = await effectivePlanKey(db, userId);
  if (planBefore !== PAID_PLAN && planAfter === PAID_PLAN) {
    await recordServerEvent(db, {
      eventName: "subscription_started",
      userId,
      properties: { planKey: planAfter },
    });
  } else if (planBefore === PAID_PLAN && planAfter !== PAID_PLAN) {
    await recordServerEvent(db, {
      eventName: "subscription_cancelled",
      userId,
      properties: { planKey: planBefore },
    });
  }

  return { status: "applied", detail: `${mapped.planKey}:${mapped.status}` };
}

/**
 * Prefers the metadata hint, then falls back to the stored customer mapping. The hint is
 * verified against the users table so a forged id cannot point at an arbitrary row.
 */
async function resolveUserId(
  db: D1Database,
  userIdHint: string | null,
  customerId: string | null,
): Promise<string | null> {
  if (userIdHint) {
    const row = await db
      .prepare("SELECT id FROM users WHERE id = ?1")
      .bind(userIdHint)
      .first<{ id: string }>();
    if (row?.id) return row.id;
  }
  if (customerId) return findUserIdForCustomer(db, customerId);
  return null;
}

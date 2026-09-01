// Stripe integration for Founding Plus.
//
// Two rules shape this module:
//  1. Payment never grants access directly. Stripe only writes to the `subscriptions`
//     table; `src/lib/server/entitlements.ts` remains the sole authority on limits.
//  2. A webhook is only trusted after its signature verifies against the endpoint secret.
//     An unsigned or stale request is rejected before any state is read.
import type { D1Database } from "@cloudflare/workers-types";
// Environment access deliberately lives in `stripe-config.ts` so this module stays free of
// Cloudflare runtime imports and can be loaded directly by the unit test runner.
import { PAID_PLAN, type PlanKey } from "@/lib/plans";
import { randomId } from "./crypto";

const STRIPE_API_BASE = "https://api.stripe.com";
const SIGNATURE_TOLERANCE_SECONDS = 300;

export type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  priceMonthly: string;
  priceAnnual: string;
};

export type BillingInterval = "monthly" | "annual";

/** Public, non-secret pricing copy. These figures are fixed product decisions. */
export const FOUNDING_PLUS_PRICING = {
  monthly: { amount: "$9.99", period: "month" },
  annual: { amount: "$79", period: "year" },
} as const;

/** Checkout needs the secret key and at least one price; the webhook secret does not matter yet. */
export function checkoutConfigured(config: Partial<StripeConfig>): boolean {
  return Boolean(config.secretKey && (config.priceMonthly || config.priceAnnual));
}

export function priceForInterval(config: Partial<StripeConfig>, interval: BillingInterval) {
  return interval === "annual" ? config.priceAnnual : config.priceMonthly;
}

/**
 * Maps a Stripe price id to a plan. Anything unrecognised resolves to `free` rather than
 * to a paid plan, so a misconfigured price can never silently grant Founding Plus.
 */
export function planForPrice(config: Partial<StripeConfig>, priceId: string | null | undefined): PlanKey {
  if (!priceId) return "free";
  if (priceId === config.priceMonthly || priceId === config.priceAnnual) return PAID_PLAN;
  return "free";
}

function formEncode(payload: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export type StripeCallResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function stripeRequest<T>(
  secretKey: string,
  path: string,
  payload: Record<string, string | number | undefined>,
  idempotencyKey?: string,
): Promise<StripeCallResult<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${STRIPE_API_BASE}${path}`, {
      method: "POST",
      headers,
      body: formEncode(payload),
    });
  } catch {
    return { ok: false, status: 502, message: "Stripe could not be reached." };
  }

  const body = (await response.json().catch(() => null)) as
    | (T & { error?: { message?: string } })
    | null;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: body?.error?.message || "Stripe rejected the request.",
    };
  }
  return { ok: true, data: body as T };
}

export type CheckoutSessionPayloadInput = {
  priceId: string;
  userId: string;
  email: string;
  customerId: string | null;
  successUrl: string;
  cancelUrl: string;
};

/**
 * Built as a pure function so the request shape can be asserted in tests without
 * contacting Stripe.
 */
export function buildCheckoutSessionPayload(
  input: CheckoutSessionPayloadInput,
): Record<string, string | number | undefined> {
  return {
    mode: "subscription",
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": 1,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    // Both are set so a webhook can resolve the account even if the customer record is new.
    client_reference_id: input.userId,
    "metadata[userId]": input.userId,
    "subscription_data[metadata][userId]": input.userId,
    customer: input.customerId || undefined,
    customer_email: input.customerId ? undefined : input.email,
  };
}

export async function createCheckoutSession(
  secretKey: string,
  input: CheckoutSessionPayloadInput,
): Promise<StripeCallResult<{ id: string; url: string }>> {
  return stripeRequest(
    secretKey,
    "/v1/checkout/sessions",
    buildCheckoutSessionPayload(input),
    // Scoped to the user so a double click reuses the same Stripe session.
    `checkout_${input.userId}_${input.priceId}`,
  );
}

export async function createPortalSession(
  secretKey: string,
  input: { customerId: string; returnUrl: string },
): Promise<StripeCallResult<{ id: string; url: string }>> {
  return stripeRequest(secretKey, "/v1/billing_portal/sessions", {
    customer: input.customerId,
    return_url: input.returnUrl,
  });
}

// ---------------------------------------------------------------- signatures

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeStripeSignature(
  secret: string,
  timestamp: number,
  payload: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`));
  return toHex(signature);
}

export type SignatureFailure =
  | "missing_signature"
  | "malformed_signature"
  | "timestamp_out_of_tolerance"
  | "signature_mismatch";

export type SignatureResult = { ok: true } | { ok: false; reason: SignatureFailure };

/**
 * Verifies a `Stripe-Signature` header of the form `t=<unix>,v1=<hex>[,v1=<hex>]`.
 *
 * The timestamp is checked before the digest so a captured request cannot be replayed
 * indefinitely, and every provided `v1` value is compared because Stripe includes more
 * than one during secret rotation.
 */
export async function verifyStripeSignature(
  secret: string,
  header: string | null,
  payload: string,
  now = Date.now(),
): Promise<SignatureResult> {
  if (!header) return { ok: false, reason: "missing_signature" };

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=");
    if (!key || !value) continue;
    const trimmedKey = key.trim();
    if (trimmedKey === "t") timestamp = Number(value.trim());
    if (trimmedKey === "v1") signatures.push(value.trim());
  }

  if (timestamp === null || !Number.isFinite(timestamp) || signatures.length === 0) {
    return { ok: false, reason: "malformed_signature" };
  }

  const ageSeconds = Math.abs(now / 1000 - timestamp);
  if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }

  const expected = await computeStripeSignature(secret, timestamp, payload);
  const matched = signatures.some((candidate) => timingSafeEqual(candidate, expected));
  return matched ? { ok: true } : { ok: false, reason: "signature_mismatch" };
}

// ---------------------------------------------------------------- persistence

export type SubscriptionUpsert = {
  userId: string;
  planKey: PlanKey;
  status: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

export async function upsertSubscription(db: D1Database, input: SubscriptionUpsert): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO subscriptions (
         id, user_id, provider, provider_customer_id, provider_subscription_id,
         plan_key, status, current_period_end, cancel_at_period_end, created_at, updated_at
       )
       VALUES (?1, ?2, 'stripe', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
       ON CONFLICT(user_id) DO UPDATE SET
         provider = 'stripe',
         provider_customer_id = COALESCE(excluded.provider_customer_id, subscriptions.provider_customer_id),
         provider_subscription_id = COALESCE(excluded.provider_subscription_id, subscriptions.provider_subscription_id),
         plan_key = excluded.plan_key,
         status = excluded.status,
         current_period_end = COALESCE(excluded.current_period_end, subscriptions.current_period_end),
         cancel_at_period_end = excluded.cancel_at_period_end,
         updated_at = excluded.updated_at`,
    )
    .bind(
      randomId("sub_"),
      input.userId,
      input.customerId ?? null,
      input.subscriptionId ?? null,
      input.planKey,
      input.status,
      input.currentPeriodEnd ?? null,
      input.cancelAtPeriodEnd ? 1 : 0,
      now,
    )
    .run();
}

/**
 * Links a Stripe customer to an account without touching plan or status.
 *
 * Stripe does not guarantee event ordering. A `checkout.session.completed` delivery can
 * arrive after the subscription is already active, so this must never overwrite the plan
 * that the authoritative subscription event established.
 */
export async function linkStripeCustomer(
  db: D1Database,
  input: { userId: string; customerId: string | null; subscriptionId: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO subscriptions (
         id, user_id, provider, provider_customer_id, provider_subscription_id,
         plan_key, status, cancel_at_period_end, created_at, updated_at
       )
       VALUES (?1, ?2, 'stripe', ?3, ?4, 'free', 'incomplete', 0, ?5, ?5)
       ON CONFLICT(user_id) DO UPDATE SET
         provider = 'stripe',
         provider_customer_id = COALESCE(excluded.provider_customer_id, subscriptions.provider_customer_id),
         provider_subscription_id = COALESCE(excluded.provider_subscription_id, subscriptions.provider_subscription_id),
         updated_at = excluded.updated_at`,
    )
    .bind(randomId("sub_"), input.userId, input.customerId, input.subscriptionId, now)
    .run();
}

export async function findUserIdForCustomer(
  db: D1Database,
  customerId: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT user_id FROM subscriptions WHERE provider_customer_id = ?1 LIMIT 1")
    .bind(customerId)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

export async function readSubscriptionForUser(db: D1Database, userId: string) {
  return db
    .prepare(
      `SELECT plan_key, status, provider_customer_id, provider_subscription_id,
              current_period_end, cancel_at_period_end
       FROM subscriptions WHERE user_id = ?1`,
    )
    .bind(userId)
    .first<{
      plan_key: string;
      status: string;
      provider_customer_id: string | null;
      provider_subscription_id: string | null;
      current_period_end: string | null;
      cancel_at_period_end: number;
    }>();
}

/**
 * Claims a Stripe event id. Returns false when the event was already recorded, which is
 * how replayed deliveries are made harmless.
 */
export async function claimStripeEvent(
  db: D1Database,
  eventId: string,
  eventType: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO stripe_events (id, event_type, received_at, status)
       VALUES (?1, ?2, ?3, 'received')
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(eventId, eventType, new Date().toISOString())
    .run();
  return Number(result.meta?.changes || 0) > 0;
}

export async function completeStripeEvent(
  db: D1Database,
  eventId: string,
  status: "applied" | "ignored" | "failed",
  detail?: string,
): Promise<void> {
  await db
    .prepare("UPDATE stripe_events SET status = ?2, processed_at = ?3, detail = ?4 WHERE id = ?1")
    .bind(eventId, status, new Date().toISOString(), detail ?? null)
    .run();
}

// ---------------------------------------------------------------- event mapping

type StripeSubscriptionObject = {
  id?: string;
  customer?: string;
  status?: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  items?: { data?: Array<{ price?: { id?: string }; current_period_end?: number }> };
  metadata?: Record<string, string>;
};

type StripeCheckoutSessionObject = {
  id?: string;
  customer?: string;
  subscription?: string;
  client_reference_id?: string;
  metadata?: Record<string, string>;
};

export type StripeEventEnvelope = {
  id?: string;
  type?: string;
  data?: { object?: unknown };
};

export type MappedSubscriptionChange = {
  kind: "subscription";
  userIdHint: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  planKey: PlanKey;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type MappedCheckoutCompletion = {
  kind: "checkout";
  userIdHint: string | null;
  customerId: string | null;
  subscriptionId: string | null;
};

export type MappedEvent = MappedSubscriptionChange | MappedCheckoutCompletion | { kind: "ignored" };

function isoFromUnix(seconds: number | undefined): string | null {
  if (!seconds || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

/**
 * Translates a Stripe event into the minimum state this product stores. Unknown event
 * types are ignored rather than guessed at.
 */
export function mapStripeEvent(config: Partial<StripeConfig>, event: StripeEventEnvelope): MappedEvent {
  const type = String(event.type || "");

  if (type === "checkout.session.completed") {
    const session = (event.data?.object || {}) as StripeCheckoutSessionObject;
    return {
      kind: "checkout",
      userIdHint: session.client_reference_id || session.metadata?.userId || null,
      customerId: session.customer || null,
      subscriptionId: session.subscription || null,
    };
  }

  if (
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted"
  ) {
    const subscription = (event.data?.object || {}) as StripeSubscriptionObject;
    const item = subscription.items?.data?.[0];
    const deleted = type === "customer.subscription.deleted";
    const status = deleted ? "canceled" : String(subscription.status || "incomplete");
    return {
      kind: "subscription",
      userIdHint: subscription.metadata?.userId || null,
      customerId: subscription.customer || null,
      subscriptionId: subscription.id || null,
      // A cancelled or unpaid subscription falls back to Free, never to no access.
      planKey: deleted ? "free" : planForPrice(config, item?.price?.id),
      status,
      currentPeriodEnd: isoFromUnix(subscription.current_period_end ?? item?.current_period_end),
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    };
  }

  return { kind: "ignored" };
}

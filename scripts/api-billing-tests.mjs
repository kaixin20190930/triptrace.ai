#!/usr/bin/env node
// Automated tests for the Stripe billing integration.
//
// No Stripe account is needed. The webhook is the part that carries real risk, and it is
// fully testable locally because Stripe's scheme is an HMAC over `<timestamp>.<payload>`:
// this script signs its own payloads with the configured endpoint secret and asserts what
// the server accepts, rejects, and applies.
//
// Setup:
//   1. Add to `.dev.vars`:
//        STRIPE_WEBHOOK_SECRET=whsec_local_test_secret
//        STRIPE_PRICE_FOUNDING_MONTHLY=price_local_monthly
//        STRIPE_PRICE_FOUNDING_ANNUAL=price_local_annual
//      Leave STRIPE_SECRET_KEY unset to also cover the not-configured checkout path.
//   2. npm run dev
//   3. STRIPE_WEBHOOK_SECRET=whsec_local_test_secret npm run test:billing -- http://127.0.0.1:3000
//
// Everything it creates is deleted by `npm run qa:cleanup` plus the cleanup at the end.

import { createHmac, randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const BASE_URL = (args.find((arg) => arg.startsWith("http")) || process.env.BASE_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
/** Optional. When set, the billing analytics assertions are included. */
const ADMIN_TOKEN = process.env.ADMIN_TASK_TOKEN || "";
const PRICE_MONTHLY = process.env.STRIPE_PRICE_FOUNDING_MONTHLY || "price_local_monthly";
const PRICE_ANNUAL = process.env.STRIPE_PRICE_FOUNDING_ANNUAL || "price_local_annual";

let failures = 0;
let total = 0;

function check(name, passed, detail = "") {
  total += 1;
  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

function createClient() {
  let cookie = "";
  return {
    async fetch(path, options = {}) {
      const headers = new Headers(options.headers || {});
      if (cookie) headers.set("Cookie", cookie);
      const response = await fetch(`${BASE_URL}${path}`, { ...options, headers, redirect: "manual" });
      for (const raw of response.headers.getSetCookie?.() || []) {
        const [pair] = raw.split(";");
        const [name, value] = pair.split("=");
        if (name?.trim() === "tt_session") cookie = value ? `tt_session=${value}` : "";
      }
      return response;
    },
  };
}

async function json(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function signPayload(payload, secret, timestampSeconds) {
  const signature = createHmac("sha256", secret).update(`${timestampSeconds}.${payload}`).digest("hex");
  return `t=${timestampSeconds},v1=${signature}`;
}

async function postWebhook(payload, { secret = WEBHOOK_SECRET, timestamp, header } = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const stamp = timestamp ?? Math.floor(Date.now() / 1000);
  const headers = { "Content-Type": "application/json" };
  const signature = header === undefined ? signPayload(body, secret, stamp) : header;
  if (signature !== null) headers["Stripe-Signature"] = signature;
  const response = await fetch(`${BASE_URL}/api/billing/webhook`, { method: "POST", headers, body });
  return { response, body: await json(response) };
}

function subscriptionEvent({
  id = `evt_${randomUUID()}`,
  type = "customer.subscription.updated",
  userId,
  customerId = "cus_qa_local",
  subscriptionId = "sub_qa_local",
  priceId = PRICE_MONTHLY,
  status = "active",
  periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400,
  cancelAtPeriodEnd = false,
} = {}) {
  return {
    id,
    type,
    data: {
      object: {
        id: subscriptionId,
        customer: customerId,
        status,
        cancel_at_period_end: cancelAtPeriodEnd,
        current_period_end: periodEnd,
        items: { data: [{ price: { id: priceId } }] },
        metadata: userId ? { userId } : {},
      },
    },
  };
}

async function billingSummary(userId) {
  const response = await fetch(
    `${BASE_URL}/api/admin/analytics/summary?userId=${encodeURIComponent(userId)}`,
    { headers: { "x-triptrace-admin-token": ADMIN_TOKEN } },
  );
  return json(response);
}

async function billingCounts(userId) {
  const summary = await billingSummary(userId);
  return new Map((summary?.events || []).map((row) => [row.eventName, row.count]));
}

async function run() {
  console.log(`Running billing tests against ${BASE_URL}\n`);

  const probe = await fetch(`${BASE_URL}/api/entitlements`).catch(() => null);
  if (!probe) {
    console.error(`Cannot reach ${BASE_URL}. Start \`npm run dev\` first.`);
    process.exit(2);
  }

  const guest = createClient();
  const owner = createClient();

  // ---------------------------------------------------------------- access control
  const guestCheckout = await guest.fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interval: "monthly" }),
  });
  check(
    "checkout requires an account",
    guestCheckout.status === 401,
    `status=${guestCheckout.status}`,
  );

  const guestPortal = await guest.fetch("/api/billing/portal", { method: "POST" });
  check("the billing portal requires an account", guestPortal.status === 401, `status=${guestPortal.status}`);

  const email = `qa-billing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  const signUp = await owner.fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "QaBilling!9xA", displayName: "QA Billing" }),
  });
  const signUpBody = await json(signUp);
  const userId = signUpBody?.user?.id;
  if (!userId) {
    console.error("Could not create the test account:", signUp.status, signUpBody);
    process.exit(1);
  }

  const badInterval = await owner.fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interval: "weekly" }),
  });
  const badIntervalBody = await json(badInterval);
  check(
    "checkout rejects an unsupported interval before contacting Stripe",
    badInterval.status === 400 && badIntervalBody?.error?.code === "invalid_interval",
    `status=${badInterval.status} code=${badIntervalBody?.error?.code}`,
  );

  const checkoutAttempt = await owner.fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interval: "monthly" }),
  });
  const checkoutBody = await json(checkoutAttempt);
  if (checkoutAttempt.status === 503) {
    check(
      "checkout reports itself unavailable when Stripe keys are absent",
      checkoutBody?.error?.code === "billing_not_configured" ||
        checkoutBody?.error?.code === "billing_price_missing",
      `code=${checkoutBody?.error?.code}`,
    );
  } else {
    check(
      "checkout returns a Stripe URL when keys are configured",
      checkoutAttempt.status === 200 && typeof checkoutBody?.url === "string",
      `status=${checkoutAttempt.status}`,
    );
  }

  const portalWithoutCustomer = await owner.fetch("/api/billing/portal", { method: "POST" });
  const portalBody = await json(portalWithoutCustomer);
  check(
    "the portal refuses an account with no billing history",
    portalWithoutCustomer.status === 409 || portalWithoutCustomer.status === 503,
    `status=${portalWithoutCustomer.status} code=${portalBody?.error?.code}`,
  );

  // ---------------------------------------------------------------- signature handling
  if (!WEBHOOK_SECRET) {
    const unconfigured = await postWebhook(subscriptionEvent({ userId }), { secret: "whsec_anything" });
    check(
      "the webhook fails shut when no endpoint secret is configured",
      unconfigured.response.status === 503 &&
        unconfigured.body?.error?.code === "billing_not_configured",
      `status=${unconfigured.response.status} code=${unconfigured.body?.error?.code}`,
    );
    console.log("SKIP  signed webhook checks (set STRIPE_WEBHOOK_SECRET to include them)");
    await finish(owner, userId);
    return;
  }

  const noSignature = await postWebhook(subscriptionEvent({ userId }), { header: null });
  check(
    "an unsigned webhook is rejected",
    noSignature.response.status === 400 && noSignature.body?.error?.code === "stripe_missing_signature",
    `status=${noSignature.response.status} code=${noSignature.body?.error?.code}`,
  );

  const malformed = await postWebhook(subscriptionEvent({ userId }), { header: "not-a-signature" });
  check(
    "a malformed signature header is rejected",
    malformed.response.status === 400 && malformed.body?.error?.code === "stripe_malformed_signature",
    `status=${malformed.response.status} code=${malformed.body?.error?.code}`,
  );

  const wrongSecret = await postWebhook(subscriptionEvent({ userId }), { secret: "whsec_wrong_secret" });
  check(
    "a signature from the wrong secret is rejected",
    wrongSecret.response.status === 400 && wrongSecret.body?.error?.code === "stripe_signature_mismatch",
    `status=${wrongSecret.response.status} code=${wrongSecret.body?.error?.code}`,
  );

  const stale = await postWebhook(subscriptionEvent({ userId }), {
    timestamp: Math.floor(Date.now() / 1000) - 3600,
  });
  check(
    "a correctly signed but stale webhook is rejected, so a captured request cannot be replayed",
    stale.response.status === 400 && stale.body?.error?.code === "stripe_timestamp_out_of_tolerance",
    `status=${stale.response.status} code=${stale.body?.error?.code}`,
  );

  const tampered = await (async () => {
    const original = JSON.stringify(subscriptionEvent({ userId }));
    const stamp = Math.floor(Date.now() / 1000);
    const header = signPayload(original, WEBHOOK_SECRET, stamp);
    const modified = original.replace('"active"', '"trialing"');
    const response = await fetch(`${BASE_URL}/api/billing/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": header },
      body: modified,
    });
    return { response, body: await json(response) };
  })();
  check(
    "a payload modified after signing is rejected",
    tampered.response.status === 400 && tampered.body?.error?.code === "stripe_signature_mismatch",
    `status=${tampered.response.status} code=${tampered.body?.error?.code}`,
  );

  // ---------------------------------------------------------------- state transitions
  async function entitlements() {
    return json(await owner.fetch("/api/entitlements"));
  }

  const before = await entitlements();
  check("the account starts on the free plan", before?.plan?.key === "free", `plan=${before?.plan?.key}`);

  const activate = await postWebhook(
    subscriptionEvent({ userId, type: "customer.subscription.created", status: "active" }),
  );
  check(
    "a signed subscription event is accepted",
    activate.response.status === 200 && activate.body?.applied === true,
    `status=${activate.response.status} applied=${activate.body?.applied}`,
  );

  const afterActivate = await entitlements();
  check(
    "an active subscription grants Founding Plus limits through the entitlement layer",
    afterActivate?.plan?.key === "founding_plus" &&
      afterActivate?.limits?.permanentTraces === 500 &&
      afterActivate?.limits?.aiGenerations === 50,
    `plan=${afterActivate?.plan?.key} traces=${afterActivate?.limits?.permanentTraces}`,
  );
  check(
    "subscription status and renewal date are visible to the client",
    afterActivate?.subscription?.status === "active" &&
      typeof afterActivate?.subscription?.currentPeriodEnd === "string",
    JSON.stringify(afterActivate?.subscription),
  );

  const annual = await postWebhook(
    subscriptionEvent({ userId, priceId: PRICE_ANNUAL, status: "active" }),
  );
  const afterAnnual = await entitlements();
  check(
    "the annual price also maps to Founding Plus",
    annual.response.status === 200 && afterAnnual?.plan?.key === "founding_plus",
    `plan=${afterAnnual?.plan?.key}`,
  );

  // Idempotency: the same event id twice must not be applied twice.
  const replayEvent = subscriptionEvent({ userId, status: "active" });
  const firstDelivery = await postWebhook(replayEvent);
  const secondDelivery = await postWebhook(replayEvent);
  check(
    "a replayed webhook is acknowledged without being applied again",
    firstDelivery.response.status === 200 &&
      secondDelivery.response.status === 200 &&
      secondDelivery.body?.duplicate === true,
    `first=${firstDelivery.response.status} second=${JSON.stringify(secondDelivery.body)}`,
  );

  // Ordering: a late checkout.session.completed must not undo an active plan.
  const lateCheckout = await postWebhook({
    id: `evt_${randomUUID()}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_qa_local",
        customer: "cus_qa_local",
        subscription: "sub_qa_local",
        client_reference_id: userId,
      },
    },
  });
  const afterLateCheckout = await entitlements();
  check(
    "a late checkout event links the customer without downgrading an active plan",
    lateCheckout.response.status === 200 && afterLateCheckout?.plan?.key === "founding_plus",
    `plan=${afterLateCheckout?.plan?.key}`,
  );

  // At this point the account went free -> paid once, then received three further paid
  // updates (annual price, a replay, and a late checkout link). Only the first is a real
  // transition, so only one event may exist.
  if (ADMIN_TOKEN) {
    const counts = await billingCounts(userId);
    check(
      "one subscription start is recorded for one real transition",
      counts.get("subscription_started") === 1,
      `started=${counts.get("subscription_started")}`,
    );
    check(
      "repeated paid updates do not each record a start",
      (counts.get("subscription_started") || 0) === 1 && !counts.has("subscription_cancelled"),
      `started=${counts.get("subscription_started")} cancelled=${counts.get("subscription_cancelled")}`,
    );
  }

  const portalWithCustomer = await owner.fetch("/api/billing/portal", { method: "POST" });
  const portalWithCustomerBody = await json(portalWithCustomer);
  check(
    "the portal is reachable once a Stripe customer is linked",
    portalWithCustomer.status === 200 ||
      portalWithCustomerBody?.error?.code === "billing_not_configured" ||
      portalWithCustomerBody?.error?.code === "billing_portal_failed",
    `status=${portalWithCustomer.status} code=${portalWithCustomerBody?.error?.code}`,
  );

  const unknownPrice = await postWebhook(
    subscriptionEvent({ userId, priceId: "price_not_ours", status: "active" }),
  );
  const afterUnknownPrice = await entitlements();
  check(
    "an unrecognised price never grants a paid plan",
    unknownPrice.response.status === 200 && afterUnknownPrice?.plan?.key === "free",
    `plan=${afterUnknownPrice?.plan?.key}`,
  );

  // Restore the paid plan, then cancel it properly.
  await postWebhook(subscriptionEvent({ userId, status: "active" }));
  const cancelPending = await postWebhook(
    subscriptionEvent({ userId, status: "active", cancelAtPeriodEnd: true }),
  );
  const afterCancelPending = await entitlements();
  check(
    "a subscription cancelling at period end keeps access until then",
    cancelPending.response.status === 200 &&
      afterCancelPending?.plan?.key === "founding_plus" &&
      afterCancelPending?.subscription?.cancelAtPeriodEnd === true,
    `plan=${afterCancelPending?.plan?.key} cancelAtPeriodEnd=${afterCancelPending?.subscription?.cancelAtPeriodEnd}`,
  );

  const deleted = await postWebhook(
    subscriptionEvent({ userId, type: "customer.subscription.deleted", status: "canceled" }),
  );
  const afterDeleted = await entitlements();
  check(
    "a deleted subscription returns the account to Free rather than to no access",
    deleted.response.status === 200 &&
      afterDeleted?.plan?.key === "free" &&
      afterDeleted?.limits?.permanentTraces === 3,
    `plan=${afterDeleted?.plan?.key} traces=${afterDeleted?.limits?.permanentTraces}`,
  );

  // The full sequence made two real losses of the paid plan: the unrecognised price and
  // the deletion. Between them the plan was restored once, so two starts and two
  // cancellations is exactly right.
  if (ADMIN_TOKEN) {
    const counts = await billingCounts(userId);
    check(
      "every real plan transition is recorded, and only real transitions",
      counts.get("subscription_started") === 2 && counts.get("subscription_cancelled") === 2,
      `started=${counts.get("subscription_started")} cancelled=${counts.get("subscription_cancelled")}`,
    );
    const summary = await billingSummary(userId);
    check(
      "the analytics summary exposes counts only, never event contents",
      (summary?.events || []).every(
        (row) => Object.keys(row).sort().join(",") === "count,eventName,visitors",
      ),
      JSON.stringify(summary?.events?.[0] || {}),
    );
    check(
      "the analytics summary reports the retention window alongside the counts",
      summary?.retentionDays === 90 && typeof summary?.since === "string",
      `retentionDays=${summary?.retentionDays}`,
    );

    const summaryNoToken = await fetch(`${BASE_URL}/api/admin/analytics/summary`);
    check(
      "the analytics summary is closed without an operator token",
      summaryNoToken.status === 403 || summaryNoToken.status === 503,
      `status=${summaryNoToken.status}`,
    );
  } else {
    console.log("SKIP  billing analytics checks (set ADMIN_TASK_TOKEN to include them)");
  }

  const listAfterCancel = await owner.fetch("/api/memories?own=true");
  check(
    "a cancelled account keeps read access to its own Atlas",
    listAfterCancel.status === 200,
    `status=${listAfterCancel.status}`,
  );

  const expired = await postWebhook(
    subscriptionEvent({
      userId,
      status: "active",
      periodEnd: Math.floor(Date.now() / 1000) - 86400,
    }),
  );
  const afterExpired = await entitlements();
  check(
    "an active status with a period that already ended does not grant a paid plan",
    expired.response.status === 200 && afterExpired?.plan?.key === "free",
    `plan=${afterExpired?.plan?.key}`,
  );

  const unknownAccount = await postWebhook(
    subscriptionEvent({ userId: "usr_does_not_exist", customerId: "cus_unknown_qa" }),
  );
  check(
    "an event for an unknown account is acknowledged but not applied",
    unknownAccount.response.status === 200 && unknownAccount.body?.applied === false,
    `status=${unknownAccount.response.status} applied=${unknownAccount.body?.applied}`,
  );

  const forgedUser = await postWebhook(
    subscriptionEvent({ userId: "usr_forged_target", customerId: "cus_not_linked_qa" }),
  );
  check(
    "a forged account id in metadata cannot attach a plan to an arbitrary row",
    forgedUser.response.status === 200 && forgedUser.body?.applied === false,
    `applied=${forgedUser.body?.applied}`,
  );

  const unhandled = await postWebhook({
    id: `evt_${randomUUID()}`,
    type: "invoice.upcoming",
    data: { object: {} },
  });
  check(
    "an unhandled event type is acknowledged without being applied",
    unhandled.response.status === 200 && unhandled.body?.applied === false,
    `status=${unhandled.response.status}`,
  );

  const malformedJson = await postWebhook("{not json");
  check(
    "a signed but unparseable body is rejected",
    malformedJson.response.status === 400 && malformedJson.body?.error?.code === "invalid_body",
    `status=${malformedJson.response.status} code=${malformedJson.body?.error?.code}`,
  );

  const missingId = await postWebhook({ type: "customer.subscription.updated", data: { object: {} } });
  check(
    "a webhook without an event id is rejected",
    missingId.response.status === 400 && missingId.body?.error?.code === "invalid_event",
    `status=${missingId.response.status} code=${missingId.body?.error?.code}`,
  );

  await finish(owner, userId);
}

async function finish(owner, userId) {
  await owner.fetch("/api/auth/signout", { method: "POST" });
  console.log("");
  console.log(`QA account: ${userId}. Run \`npm run qa:cleanup\` to remove it.`);
  console.log(`${total - failures}/${total} checks passed`);
  if (failures > 0) process.exit(1);
}

run().catch((error) => {
  console.error("\nTest run aborted:", error);
  process.exit(1);
});

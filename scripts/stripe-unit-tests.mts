// Unit tests for the Stripe helpers that cannot be reached over HTTP without a real
// Stripe account: the checkout payload builder, the price-to-plan mapping, the signature
// primitives, and the event mapper.
//
// Run with: npm run test:unit
// No network, no Stripe key, no test framework.

import {
  buildCheckoutSessionPayload,
  checkoutConfigured,
  computeStripeSignature,
  mapStripeEvent,
  planForPrice,
  priceForInterval,
  verifyStripeSignature,
  type StripeConfig,
} from "../src/lib/server/stripe.ts";

let failures = 0;
let total = 0;

function check(name: string, passed: boolean, detail = "") {
  total += 1;
  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

const config: Partial<StripeConfig> = {
  secretKey: "sk_test_placeholder",
  webhookSecret: "whsec_unit_test",
  priceMonthly: "price_monthly_id",
  priceAnnual: "price_annual_id",
};

// ---------------------------------------------------------------- configuration
check("checkout is configured when a key and at least one price exist", checkoutConfigured(config));
check("checkout is not configured without a secret key", !checkoutConfigured({ priceMonthly: "p" }));
check("checkout is not configured without any price", !checkoutConfigured({ secretKey: "sk" }));
check("the monthly interval resolves to the monthly price", priceForInterval(config, "monthly") === "price_monthly_id");
check("the annual interval resolves to the annual price", priceForInterval(config, "annual") === "price_annual_id");

// ---------------------------------------------------------------- price to plan
check("the monthly price grants Founding Plus", planForPrice(config, "price_monthly_id") === "founding_plus");
check("the annual price grants Founding Plus", planForPrice(config, "price_annual_id") === "founding_plus");
check("an unknown price falls back to free", planForPrice(config, "price_someone_elses") === "free");
check("a missing price falls back to free", planForPrice(config, null) === "free");
check(
  "a price cannot grant a plan when no prices are configured",
  planForPrice({}, "price_monthly_id") === "free",
);

// ---------------------------------------------------------------- checkout payload
const newCustomerPayload = buildCheckoutSessionPayload({
  priceId: "price_monthly_id",
  userId: "usr_123",
  email: "person@example.invalid",
  customerId: null,
  successUrl: "https://app.example/plan?checkout=success",
  cancelUrl: "https://app.example/plan?checkout=cancelled",
});
check("checkout is created in subscription mode", newCustomerPayload.mode === "subscription");
check("checkout carries exactly one line item of the chosen price", 
  newCustomerPayload["line_items[0][price]"] === "price_monthly_id" &&
  newCustomerPayload["line_items[0][quantity]"] === 1,
);
check(
  "the account id travels on the session and on the subscription",
  newCustomerPayload.client_reference_id === "usr_123" &&
    newCustomerPayload["metadata[userId]"] === "usr_123" &&
    newCustomerPayload["subscription_data[metadata][userId]"] === "usr_123",
  "so a webhook can always resolve the account",
);
check(
  "a first-time buyer is identified by email, not by a customer id",
  newCustomerPayload.customer === undefined &&
    newCustomerPayload.customer_email === "person@example.invalid",
);

const returningPayload = buildCheckoutSessionPayload({
  priceId: "price_annual_id",
  userId: "usr_123",
  email: "person@example.invalid",
  customerId: "cus_existing",
  successUrl: "https://app.example/plan?checkout=success",
  cancelUrl: "https://app.example/plan?checkout=cancelled",
});
check(
  "a returning buyer reuses the existing Stripe customer and omits the email",
  returningPayload.customer === "cus_existing" && returningPayload.customer_email === undefined,
  "otherwise Stripe would create a duplicate customer",
);

// ---------------------------------------------------------------- signatures
const secret = "whsec_unit_test";
const payload = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated" });
const nowSeconds = Math.floor(Date.now() / 1000);
const signature = await computeStripeSignature(secret, nowSeconds, payload);

check("a signature is a 64 character hex digest", /^[0-9a-f]{64}$/.test(signature), signature.slice(0, 12));
check(
  "the same input always produces the same signature",
  (await computeStripeSignature(secret, nowSeconds, payload)) === signature,
);
check(
  "a different secret produces a different signature",
  (await computeStripeSignature("whsec_other", nowSeconds, payload)) !== signature,
);
check(
  "a different timestamp produces a different signature",
  (await computeStripeSignature(secret, nowSeconds + 1, payload)) !== signature,
);

const valid = await verifyStripeSignature(secret, `t=${nowSeconds},v1=${signature}`, payload);
check("a correct signature verifies", valid.ok);

const rotated = await verifyStripeSignature(
  secret,
  `t=${nowSeconds},v1=${"0".repeat(64)},v1=${signature}`,
  payload,
);
check(
  "verification accepts any one of several v1 values",
  rotated.ok,
  "Stripe sends more than one during secret rotation",
);

const missing = await verifyStripeSignature(secret, null, payload);
check("a missing header is reported as missing", !missing.ok && missing.reason === "missing_signature");

const noTimestamp = await verifyStripeSignature(secret, `v1=${signature}`, payload);
check(
  "a header without a timestamp is malformed",
  !noTimestamp.ok && noTimestamp.reason === "malformed_signature",
);

const noSignatures = await verifyStripeSignature(secret, `t=${nowSeconds}`, payload);
check(
  "a header without any v1 value is malformed",
  !noSignatures.ok && noSignatures.reason === "malformed_signature",
);

const stale = await verifyStripeSignature(
  secret,
  `t=${nowSeconds - 3600},v1=${await computeStripeSignature(secret, nowSeconds - 3600, payload)}`,
  payload,
);
check(
  "a correctly signed but old request is refused",
  !stale.ok && stale.reason === "timestamp_out_of_tolerance",
  "a captured webhook must not be replayable forever",
);

const future = await verifyStripeSignature(
  secret,
  `t=${nowSeconds + 3600},v1=${await computeStripeSignature(secret, nowSeconds + 3600, payload)}`,
  payload,
);
check(
  "a timestamp far in the future is also refused",
  !future.ok && future.reason === "timestamp_out_of_tolerance",
);

const tampered = await verifyStripeSignature(secret, `t=${nowSeconds},v1=${signature}`, `${payload} `);
check(
  "changing the payload after signing invalidates the signature",
  !tampered.ok && tampered.reason === "signature_mismatch",
);

const wrongSecret = await verifyStripeSignature("whsec_wrong", `t=${nowSeconds},v1=${signature}`, payload);
check(
  "a signature from another secret is refused",
  !wrongSecret.ok && wrongSecret.reason === "signature_mismatch",
);

const truncated = await verifyStripeSignature(secret, `t=${nowSeconds},v1=${signature.slice(0, 32)}`, payload);
check(
  "a truncated signature is refused rather than partially matched",
  !truncated.ok && truncated.reason === "signature_mismatch",
);

// ---------------------------------------------------------------- event mapping
const periodEnd = 1_800_000_000;

const created = mapStripeEvent(config, {
  id: "evt_created",
  type: "customer.subscription.created",
  data: {
    object: {
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      current_period_end: periodEnd,
      cancel_at_period_end: false,
      items: { data: [{ price: { id: "price_monthly_id" } }] },
      metadata: { userId: "usr_123" },
    },
  },
});
check(
  "a created subscription maps to Founding Plus with its identifiers",
  created.kind === "subscription" &&
    created.planKey === "founding_plus" &&
    created.status === "active" &&
    created.userIdHint === "usr_123" &&
    created.customerId === "cus_1" &&
    created.subscriptionId === "sub_1",
  JSON.stringify(created),
);
check(
  "the period end is converted from unix seconds to ISO",
  created.kind === "subscription" && created.currentPeriodEnd === new Date(periodEnd * 1000).toISOString(),
);

const deleted = mapStripeEvent(config, {
  id: "evt_deleted",
  type: "customer.subscription.deleted",
  data: {
    object: {
      id: "sub_1",
      customer: "cus_1",
      status: "active",
      items: { data: [{ price: { id: "price_monthly_id" } }] },
      metadata: { userId: "usr_123" },
    },
  },
});
check(
  "a deleted subscription maps to free and canceled even if the payload still says active",
  deleted.kind === "subscription" && deleted.planKey === "free" && deleted.status === "canceled",
  JSON.stringify(deleted),
);

const foreignPrice = mapStripeEvent(config, {
  id: "evt_foreign",
  type: "customer.subscription.updated",
  data: {
    object: {
      id: "sub_2",
      customer: "cus_2",
      status: "active",
      items: { data: [{ price: { id: "price_not_ours" } }] },
    },
  },
});
check(
  "an active subscription on an unrecognised price maps to free",
  foreignPrice.kind === "subscription" && foreignPrice.planKey === "free",
  "a misconfigured price must never grant a paid plan",
);

const cancelling = mapStripeEvent(config, {
  id: "evt_cancelling",
  type: "customer.subscription.updated",
  data: {
    object: {
      id: "sub_3",
      customer: "cus_3",
      status: "active",
      cancel_at_period_end: true,
      current_period_end: periodEnd,
      items: { data: [{ price: { id: "price_annual_id" } }] },
    },
  },
});
check(
  "a subscription cancelling at period end keeps its plan and records the flag",
  cancelling.kind === "subscription" &&
    cancelling.planKey === "founding_plus" &&
    cancelling.cancelAtPeriodEnd === true,
);

const checkout = mapStripeEvent(config, {
  id: "evt_checkout",
  type: "checkout.session.completed",
  data: {
    object: { id: "cs_1", customer: "cus_9", subscription: "sub_9", client_reference_id: "usr_9" },
  },
});
check(
  "a completed checkout maps to a customer link, not to a plan change",
  checkout.kind === "checkout" &&
    checkout.userIdHint === "usr_9" &&
    checkout.customerId === "cus_9" &&
    checkout.subscriptionId === "sub_9",
  "Stripe does not guarantee event order, so the plan comes from the subscription event",
);

const metadataFallback = mapStripeEvent(config, {
  id: "evt_checkout_meta",
  type: "checkout.session.completed",
  data: { object: { id: "cs_2", customer: "cus_10", metadata: { userId: "usr_10" } } },
});
check(
  "a checkout without client_reference_id falls back to metadata",
  metadataFallback.kind === "checkout" && metadataFallback.userIdHint === "usr_10",
);

check(
  "an unhandled event type is ignored rather than guessed at",
  mapStripeEvent(config, { id: "evt_x", type: "invoice.upcoming", data: { object: {} } }).kind === "ignored",
);
check(
  "an event with no type is ignored",
  mapStripeEvent(config, { id: "evt_y", data: { object: {} } }).kind === "ignored",
);
check(
  "a subscription event with no price still maps, and maps to free",
  (() => {
    const mapped = mapStripeEvent(config, {
      id: "evt_z",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_z", customer: "cus_z", status: "active" } },
    });
    return mapped.kind === "subscription" && mapped.planKey === "free";
  })(),
);

console.log("");
console.log(`${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);

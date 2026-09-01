// Stripe configuration reading.
//
// Kept apart from `stripe.ts` so that module stays free of Cloudflare runtime imports and
// can be exercised directly by `scripts/stripe-unit-tests.mts`.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { StripeConfig } from "./stripe";

export async function readStripeConfig(): Promise<Partial<StripeConfig>> {
  const { env } = await getCloudflareContext({ async: true });
  const source = env as unknown as Record<string, string | undefined>;
  return {
    secretKey: source.STRIPE_SECRET_KEY,
    webhookSecret: source.STRIPE_WEBHOOK_SECRET,
    priceMonthly: source.STRIPE_PRICE_FOUNDING_MONTHLY,
    priceAnnual: source.STRIPE_PRICE_FOUNDING_ANNUAL,
  };
}

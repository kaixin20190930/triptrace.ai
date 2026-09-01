// Shared plan definitions. Safe to import from both client and server code.
// The server is the only authority: `src/lib/server/entitlements.ts` enforces these numbers.
// Client code may read them for copy, but must never treat a client check as protection.

export const PLAN_KEYS = ["guest", "free", "founding_plus"] as const;

export type PlanKey = (typeof PLAN_KEYS)[number];

export type PlanLimits = {
  /** Maximum permanently saved traces the subject may hold at once. */
  permanentTraces: number;
  /** Maximum successful AI generations per metering period. */
  aiGenerations: number;
  /** Maximum photos attached to a single trace. */
  imagesPerTrace: number;
};

export type PlanDefinition = {
  key: PlanKey;
  label: string;
  /** `lifetime` allowances never reset; `monthly` allowances reset each UTC calendar month. */
  aiGenerationPeriod: "lifetime" | "monthly";
  limits: PlanLimits;
};

export const PLANS: Record<PlanKey, PlanDefinition> = {
  guest: {
    key: "guest",
    label: "Guest",
    aiGenerationPeriod: "lifetime",
    limits: {
      permanentTraces: 0,
      aiGenerations: 1,
      imagesPerTrace: 20,
    },
  },
  free: {
    key: "free",
    label: "Free",
    aiGenerationPeriod: "monthly",
    limits: {
      permanentTraces: 3,
      aiGenerations: 5,
      imagesPerTrace: 20,
    },
  },
  founding_plus: {
    key: "founding_plus",
    label: "Founding Plus",
    aiGenerationPeriod: "monthly",
    limits: {
      permanentTraces: 500,
      aiGenerations: 50,
      imagesPerTrace: 20,
    },
  },
};

export const DEFAULT_SIGNED_IN_PLAN: PlanKey = "free";
export const PAID_PLAN: PlanKey = "founding_plus";

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && (PLAN_KEYS as readonly string[]).includes(value);
}

export function planLimits(planKey: PlanKey): PlanLimits {
  return PLANS[planKey].limits;
}

/**
 * Stable machine-readable entitlement codes. These are part of the API contract:
 * the client maps them to copy, and analytics records them as paywall reasons.
 */
export const ENTITLEMENT_CODES = {
  guestDemoUsed: "entitlement_guest_demo_used",
  generationLimitReached: "entitlement_generation_limit_reached",
  traceLimitReached: "entitlement_trace_limit_reached",
  imageLimitExceeded: "entitlement_image_limit_exceeded",
  saveRequiresAccount: "entitlement_save_requires_account",
} as const;

export type EntitlementCode = (typeof ENTITLEMENT_CODES)[keyof typeof ENTITLEMENT_CODES];

const ENTITLEMENT_CODE_VALUES: readonly string[] = Object.values(ENTITLEMENT_CODES);

export function isEntitlementCode(value: unknown): value is EntitlementCode {
  return typeof value === "string" && ENTITLEMENT_CODE_VALUES.includes(value);
}

/** English product copy for every entitlement refusal. */
export function entitlementMessage(code: EntitlementCode, planKey: PlanKey = "guest"): string {
  switch (code) {
    case ENTITLEMENT_CODES.guestDemoUsed:
      return "Your free guest draft has been used. Create a free account to keep drafting and to save traces privately.";
    case ENTITLEMENT_CODES.generationLimitReached:
      return planKey === PAID_PLAN
        ? `You have used all ${PLANS[PAID_PLAN].limits.aiGenerations} AI drafts included this month. The allowance resets at the start of next month.`
        : `You have used all ${PLANS.free.limits.aiGenerations} AI drafts included this month on the Free plan. Founding Plus raises this to ${PLANS[PAID_PLAN].limits.aiGenerations} per month.`;
    case ENTITLEMENT_CODES.traceLimitReached:
      return planKey === PAID_PLAN
        ? `Your Atlas has reached the ${PLANS[PAID_PLAN].limits.permanentTraces} saved trace limit. Delete a trace to free a slot.`
        : `The Free plan keeps ${PLANS.free.limits.permanentTraces} saved traces. Delete a trace to free a slot, or upgrade to Founding Plus for ${PLANS[PAID_PLAN].limits.permanentTraces}.`;
    case ENTITLEMENT_CODES.imageLimitExceeded:
      return `A single trace can hold at most ${PLANS.free.limits.imagesPerTrace} photos.`;
    case ENTITLEMENT_CODES.saveRequiresAccount:
      return "Create a free account to save this trace privately.";
    default:
      return "This action is not included in your current plan.";
  }
}

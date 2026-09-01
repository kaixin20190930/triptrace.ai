// Server-side plan resolution, quota metering, and enforcement (PA-401 to PA-404).
//
// Rules this module exists to guarantee:
//  1. Limits are decided on the server. Hiding a button is never protection.
//  2. A direct API call cannot bypass a limit.
//  3. Concurrent or repeated requests cannot spend more than the allowance,
//     because every increment is a single conditional SQL statement.
//  4. A failed AI request does not consume an AI generation.
import type { D1Database } from "@cloudflare/workers-types";
import {
  DEFAULT_SIGNED_IN_PLAN,
  ENTITLEMENT_CODES,
  PLANS,
  entitlementMessage,
  isPlanKey,
  type EntitlementCode,
  type PlanKey,
  type PlanLimits,
} from "@/lib/plans";
import { getClientIp } from "./rate-limit";
import { errorResponse, jsonResponse } from "./http";
import type { SessionUser } from "./auth";

export const METRIC_AI_GENERATION = "ai_generation";
export const LIFETIME_PERIOD_KEY = "lifetime";

const GUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

export type Entitlements = {
  planKey: PlanKey;
  limits: PlanLimits;
  /** Subject key used for usage metering: a user id, or `guest:<hash>`. */
  subjectKey: string;
  /** Period key used for the AI generation allowance. */
  aiPeriodKey: string;
  signedIn: boolean;
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};

export type UsageSnapshot = {
  used: number;
  limit: number;
  remaining: number;
};

/** UTC calendar month, so the reset boundary does not depend on the viewer's timezone. */
export function monthlyPeriodKey(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Guest metering subject.
 *
 * A client-supplied device id is used when it is well formed, and the request IP is the
 * fallback so that clearing local storage cannot silently mint a fresh allowance from
 * nothing. The value is hashed because a quota table has no reason to hold a raw
 * client identifier.
 */
export async function guestSubjectKey(request: Request, guestId: unknown): Promise<string> {
  const candidate = String(guestId ?? "").trim();
  if (GUEST_ID_PATTERN.test(candidate)) {
    return `guest:device:${(await sha256Hex(candidate)).slice(0, 32)}`;
  }
  return `guest:ip:${(await sha256Hex(getClientIp(request))).slice(0, 32)}`;
}

async function resolvePlan(
  db: D1Database,
  userId: string,
): Promise<{ planKey: PlanKey; subscription: Entitlements["subscription"] }> {
  const row = await db
    .prepare(
      `SELECT plan_key, status, current_period_end, cancel_at_period_end
       FROM subscriptions
       WHERE user_id = ?1`,
    )
    .bind(userId)
    .first<{
      plan_key: string;
      status: string;
      current_period_end: string | null;
      cancel_at_period_end: number;
    }>();

  if (!row) return { planKey: DEFAULT_SIGNED_IN_PLAN, subscription: null };

  const subscription = {
    status: String(row.status || "unknown"),
    currentPeriodEnd: row.current_period_end ?? null,
    cancelAtPeriodEnd: Number(row.cancel_at_period_end || 0) === 1,
  };

  const statusAllows = ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status);
  const periodAllows =
    !subscription.currentPeriodEnd || new Date(subscription.currentPeriodEnd).getTime() > Date.now();
  const planAllows = isPlanKey(row.plan_key) && row.plan_key !== "guest";

  if (statusAllows && periodAllows && planAllows) {
    return { planKey: row.plan_key as PlanKey, subscription };
  }
  // A lapsed, cancelled, or unknown plan degrades to Free rather than to no access,
  // because a paying user must never lose read or delete rights over their own Atlas.
  return { planKey: DEFAULT_SIGNED_IN_PLAN, subscription };
}

export async function getEntitlements(
  db: D1Database,
  user: SessionUser | null,
  request: Request,
  guestId?: unknown,
): Promise<Entitlements> {
  if (!user) {
    return {
      planKey: "guest",
      limits: PLANS.guest.limits,
      subjectKey: await guestSubjectKey(request, guestId),
      aiPeriodKey: LIFETIME_PERIOD_KEY,
      signedIn: false,
      subscription: null,
    };
  }

  const { planKey, subscription } = await resolvePlan(db, user.id);
  return {
    planKey,
    limits: PLANS[planKey].limits,
    subjectKey: user.id,
    aiPeriodKey: PLANS[planKey].aiGenerationPeriod === "monthly" ? monthlyPeriodKey() : LIFETIME_PERIOD_KEY,
    signedIn: true,
    subscription,
  };
}

async function readCount(
  db: D1Database,
  subjectKey: string,
  periodKey: string,
  metricKey: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT count FROM usage_counters
       WHERE user_id = ?1 AND period_key = ?2 AND metric_key = ?3`,
    )
    .bind(subjectKey, periodKey, metricKey)
    .first<{ count: number }>();
  return Number(row?.count || 0);
}

/**
 * Atomically claim one unit of an allowance.
 *
 * The conditional `UPDATE ... WHERE count < limit` is a single statement, so two
 * simultaneous requests cannot both observe the same free slot. `changes === 0`
 * means the allowance was already exhausted.
 */
export async function reserveUsage(
  db: D1Database,
  subjectKey: string,
  periodKey: string,
  metricKey: string,
  limit: number,
): Promise<{ ok: true; used: number } | { ok: false; used: number }> {
  const now = new Date().toISOString();
  if (limit <= 0) {
    return { ok: false, used: await readCount(db, subjectKey, periodKey, metricKey) };
  }

  await db
    .prepare(
      `INSERT INTO usage_counters (user_id, period_key, metric_key, count, updated_at)
       VALUES (?1, ?2, ?3, 0, ?4)
       ON CONFLICT(user_id, period_key, metric_key) DO NOTHING`,
    )
    .bind(subjectKey, periodKey, metricKey, now)
    .run();

  const result = await db
    .prepare(
      `UPDATE usage_counters
       SET count = count + 1, updated_at = ?4
       WHERE user_id = ?1 AND period_key = ?2 AND metric_key = ?3 AND count < ?5`,
    )
    .bind(subjectKey, periodKey, metricKey, now, limit)
    .run();

  const changed = Number(result.meta?.changes || 0) > 0;
  const used = await readCount(db, subjectKey, periodKey, metricKey);
  return changed ? { ok: true, used } : { ok: false, used };
}

/** Give a reserved unit back when the metered operation did not actually succeed. */
export async function releaseUsage(
  db: D1Database,
  subjectKey: string,
  periodKey: string,
  metricKey: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE usage_counters
       SET count = MAX(count - 1, 0), updated_at = ?4
       WHERE user_id = ?1 AND period_key = ?2 AND metric_key = ?3`,
    )
    .bind(subjectKey, periodKey, metricKey, new Date().toISOString())
    .run();
}

export async function aiGenerationUsage(
  db: D1Database,
  entitlements: Entitlements,
): Promise<UsageSnapshot> {
  const used = await readCount(db, entitlements.subjectKey, entitlements.aiPeriodKey, METRIC_AI_GENERATION);
  const limit = entitlements.limits.aiGenerations;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export async function permanentTraceUsage(
  db: D1Database,
  entitlements: Entitlements,
): Promise<UsageSnapshot> {
  const limit = entitlements.limits.permanentTraces;
  if (!entitlements.signedIn) return { used: 0, limit, remaining: 0 };
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM memories WHERE user_id = ?1")
    .bind(entitlements.subjectKey)
    .first<{ count: number }>();
  const used = Number(row?.count || 0);
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export type EntitlementDenial = {
  code: EntitlementCode;
  planKey: PlanKey;
  limit: number;
  used: number;
};

/**
 * Uniform refusal body. `error.code` is the stable contract the client renders and
 * analytics records; `entitlement` carries the numbers needed for accurate copy.
 */
export function entitlementDeniedResponse(denial: EntitlementDenial, status = 403) {
  return jsonResponse(
    {
      error: {
        code: denial.code,
        message: entitlementMessage(denial.code, denial.planKey),
      },
      entitlement: {
        code: denial.code,
        planKey: denial.planKey,
        limit: denial.limit,
        used: denial.used,
        remaining: Math.max(0, denial.limit - denial.used),
        upgradeAvailable: denial.planKey !== "founding_plus",
      },
    },
    status,
  );
}

/** Per-trace photo cap. Silently truncating would let a client exceed the rule unaware. */
export function assertImageCount(entitlements: Entitlements, photoCount: number) {
  if (photoCount > entitlements.limits.imagesPerTrace) {
    return entitlementDeniedResponse(
      {
        code: ENTITLEMENT_CODES.imageLimitExceeded,
        planKey: entitlements.planKey,
        limit: entitlements.limits.imagesPerTrace,
        used: photoCount,
      },
      400,
    );
  }
  return null;
}

export function guestSaveBlockedResponse() {
  return errorResponse(entitlementMessage(ENTITLEMENT_CODES.saveRequiresAccount), 401, "unauthorized");
}

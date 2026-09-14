import type { R2Bucket } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { clearSessionCookie, getSessionUser } from "@/lib/server/auth";
import { HttpError, requireDb } from "@/lib/server/cf";
import { verifyPassword } from "@/lib/server/crypto";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { deleteAccountData } from "@/lib/server/account-data";
import { PAID_PLAN } from "@/lib/plans";

export const dynamic = "force-dynamic";

/**
 * Complete account deletion (M3-008).
 *
 * Three deliberate constraints:
 *
 *  1. The current password is required. A session alone is not enough, because a borrowed
 *     or stolen session must not be able to destroy someone's Atlas.
 *  2. An account with a live paid subscription is refused rather than deleted, so nobody is
 *     ever billed for an account that no longer exists. The user is told to cancel first.
 *  3. Deletion is not reversible and there is no soft-delete flag. "Delete" has to mean
 *     delete for the privacy promise to be worth anything.
 */
export async function DELETE(request: Request) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, request);
    if (!user) return errorResponse("Authentication required", 401, "unauthorized");

    // Ten an hour still makes password guessing useless against PBKDF2, while leaving room
    // for someone who mistypes, and for several people behind one shared address.
    const throttled = await checkRateLimit(db, request, "account_delete", 10, 60 * 60 * 1_000);
    if (throttled) return throttled;

    const body = await readJson<{ password?: string; confirm?: string }>(request);
    const password = String(body?.password || "");
    if (!password) {
      return errorResponse("Your password is required to delete this account", 400, "password_required");
    }

    const record = await db
      .prepare("SELECT password_hash FROM users WHERE id = ?1")
      .bind(user.id)
      .first<{ password_hash: string }>();
    if (!record || !(await verifyPassword(password, record.password_hash))) {
      return errorResponse("That password is not correct", 403, "password_incorrect");
    }

    const subscription = await db
      .prepare("SELECT plan_key, status FROM subscriptions WHERE user_id = ?1")
      .bind(user.id)
      .first<{ plan_key: string; status: string }>();
    const billingIsLive =
      subscription?.plan_key === PAID_PLAN &&
      ["active", "trialing", "past_due"].includes(String(subscription?.status || ""));
    if (billingIsLive) {
      return jsonResponse(
        {
          error: {
            code: "account_has_active_subscription",
            message:
              "Cancel your subscription in the billing portal first, so you are not charged for a deleted account. Then delete the account.",
          },
        },
        409,
      );
    }

    const { env } = await getCloudflareContext({ async: true });
    const bucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA ?? null;

    const result = await deleteAccountData(db, user.id, bucket);

    return jsonResponse({ ok: true, deleted: result }, 200, {
      "Set-Cookie": clearSessionCookie(request),
      "Cache-Control": "no-store",
    });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("account_delete_failed", thrown);
    return errorResponse("Account deletion failed", 500, "account_delete_failed");
  }
}

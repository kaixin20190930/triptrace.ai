import { getSessionUser } from "@/lib/server/auth";
import { HttpError, requireDb } from "@/lib/server/cf";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";
import {
  MAX_LINKS_PER_TRACE,
  countActiveLinks,
  createShareLink,
  listShareLinks,
  revokeShareLink,
} from "@/lib/server/share-links";

export const dynamic = "force-dynamic";

const MAX_EXPIRY_DAYS = 365;

/** Links the owner already created for a trace, or for the whole account. */
export async function GET(request: Request) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, request);
    if (!user) return errorResponse("Authentication required", 401, "unauthorized");

    const memoryId = new URL(request.url).searchParams.get("memoryId")?.trim() || undefined;
    const links = await listShareLinks(db, user.id, memoryId);
    return jsonResponse({ ok: true, links }, 200, { "Cache-Control": "no-store" });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("share_list_failed", thrown);
    return errorResponse("Failed to list share links", 500, "share_list_failed");
  }
}

/**
 * Creates a link for one trace the caller owns.
 *
 * The token is returned exactly once. It is stored only as a hash, so it cannot be shown
 * again later; the owner sees a short prefix afterwards to tell links apart, and can always
 * revoke and create a new one.
 */
export async function POST(request: Request) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, request);
    if (!user) return errorResponse("Authentication required", 401, "unauthorized");

    const throttled = await checkRateLimit(db, request, "share_create", 60, 60 * 60 * 1_000);
    if (throttled) return throttled;

    const body = await readJson<{ memoryId?: string; expiresInDays?: number }>(request);
    const memoryId = String(body?.memoryId || "").trim();
    if (!memoryId) return errorResponse("memoryId is required", 400, "missing_memory_id");

    // Ownership is checked here rather than trusted from the client, so a link can never be
    // minted for someone else's trace.
    const owned = await db
      .prepare("SELECT id FROM memories WHERE id = ?1 AND user_id = ?2")
      .bind(memoryId, user.id)
      .first<{ id: string }>();
    if (!owned) return errorResponse("memory not found", 404, "memory_not_found");

    if ((await countActiveLinks(db, memoryId)) >= MAX_LINKS_PER_TRACE) {
      return errorResponse(
        `This trace already has ${MAX_LINKS_PER_TRACE} active links. Revoke one before creating another.`,
        409,
        "share_link_limit",
      );
    }

    let expiresAt: string | null = null;
    if (body?.expiresInDays !== undefined && body.expiresInDays !== null) {
      const days = Number(body.expiresInDays);
      if (!Number.isFinite(days) || days <= 0 || days > MAX_EXPIRY_DAYS) {
        return errorResponse(
          `expiresInDays must be between 1 and ${MAX_EXPIRY_DAYS}`,
          400,
          "invalid_expiry",
        );
      }
      expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    }

    const { token, summary } = await createShareLink(db, { memoryId, userId: user.id, expiresAt });
    const origin = new URL(request.url).origin;

    return jsonResponse(
      {
        ok: true,
        link: summary,
        // Shown once. Everything after this only ever sees the prefix.
        url: `${origin}/s/${token}`,
        tokenShownOnce: true,
      },
      201,
      { "Cache-Control": "no-store" },
    );
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("share_create_failed", thrown);
    return errorResponse("Failed to create a share link", 500, "share_create_failed");
  }
}

/** Revokes a link by id. Takes effect immediately, because every read re-resolves the link. */
export async function DELETE(request: Request) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, request);
    if (!user) return errorResponse("Authentication required", 401, "unauthorized");

    const linkId = new URL(request.url).searchParams.get("linkId")?.trim() || "";
    if (!linkId) return errorResponse("linkId is required", 400, "missing_link_id");

    const revoked = await revokeShareLink(db, user.id, linkId);
    if (!revoked) {
      // Covers a link that does not exist, belongs to someone else, or is already revoked.
      // They are deliberately indistinguishable, so this cannot be used to probe for ids.
      return errorResponse("share link not found", 404, "share_link_not_found");
    }

    return jsonResponse({ ok: true, revoked: true }, 200, { "Cache-Control": "no-store" });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("share_revoke_failed", thrown);
    return errorResponse("Failed to revoke the share link", 500, "share_revoke_failed");
  }
}

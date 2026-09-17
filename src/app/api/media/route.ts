import type { R2Bucket } from "@cloudflare/workers-types";
import type { D1Database } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSessionUser } from "@/lib/server/auth";
import { requireDb, HttpError } from "@/lib/server/cf";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { randomId } from "@/lib/server/crypto";
import { assertImageCount, getEntitlements } from "@/lib/server/entitlements";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function requireBucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  const bucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA;
  if (!bucket) {
    throw new HttpError(errorResponse("MEDIA bucket is not configured", 500, "media_bucket_missing"));
  }
  return bucket;
}

async function resolveMediaAccess(db: D1Database, request: Request, key: string) {
  const user = await getSessionUser(db, request);

  if (user && key.startsWith(`users/${user.id}/`)) {
    return { allowed: true, isPublic: false };
  }

  // Shared photos are deliberately not reachable here. They are served by
  // `/api/shared/[token]/media/[position]`, which addresses them by position so a recipient
  // never learns a storage key. Keeping that out of this route leaves one less way for an
  // owner-only path to be talked into serving someone else's media.

  const reference = await db
    .prepare(
      `SELECT user_id, is_public
       FROM memories
       WHERE cover_photo_key = ?1
          OR EXISTS (
            SELECT 1
            FROM json_each(memories.photo_keys_json)
            WHERE json_each.value = ?1
          )
       ORDER BY is_public DESC
       LIMIT 1`,
    )
    .bind(key)
    .first<{ user_id: string; is_public: number }>();

  if (!reference) return { allowed: false, isPublic: false, notFound: true };
  if (reference.is_public !== 0) return { allowed: true, isPublic: true };
  if (user?.id === reference.user_id) return { allowed: true, isPublic: false };
  return { allowed: false, isPublic: false, notFound: false };
}

export async function GET(request: Request) {
  try {
    const db = await requireDb();
    const bucket = await requireBucket();
    const url = new URL(request.url);
    const key = String(url.searchParams.get("key") || "").trim();
    if (!key) return errorResponse("key is required", 400, "missing_media_key");

    const access = await resolveMediaAccess(db, request, key);
    if (!access.allowed) {
      return access.notFound
        ? errorResponse("media not found", 404, "media_not_found")
        : errorResponse("not allowed", 403, "media_forbidden");
    }

    const object = await bucket.get(key);
    if (!object) return errorResponse("media not found", 404, "media_not_found");

    const headers = new Headers();
    headers.set(
      "Cache-Control",
      access.isPublic ? "public, max-age=31536000, immutable" : "private, max-age=300",
    );
    headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
    if (object.httpEtag) headers.set("ETag", object.httpEtag);

    return new Response(object.body as ReadableStream, { headers });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    return errorResponse("Failed to load media", 500, "media_load_failed");
  }
}

function guessExtension(contentType: string, filename: string): string {
  const type = contentType.toLowerCase();
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  const match = filename.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "jpg";
}

export async function POST(request: Request) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, request);
    if (!user) return errorResponse("Authentication required", 401, "unauthorized");
    const bucket = await requireBucket();

    const formData = await request.formData();
    const files = formData
      .getAll("photos")
      .filter((item): item is File => item instanceof File && item.size > 0);

    if (!files.length) return errorResponse("photos are required", 400, "missing_photos");

    // Refuse an over-limit batch instead of silently dropping the extra photos, so the
    // client is told what happened and cannot exceed the plan rule unknowingly.
    const entitlements = await getEntitlements(db, user, request);
    const imageDenial = assertImageCount(entitlements, files.length);
    if (imageDenial) return imageDenial;

    const uploaded = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return errorResponse("file too large (max 10MB)", 400, "media_too_large");
      }
      if (!file.type.startsWith("image/")) {
        return errorResponse("only image files are supported", 400, "media_invalid_type");
      }
      const ext = guessExtension(file.type, file.name);
      const key = `users/${user.id}/${new Date().toISOString().slice(0, 10)}/${randomId("img_")}.${ext}`;
      const bytes = await file.arrayBuffer();
      await bucket.put(key, bytes, {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
        customMetadata: { userId: user.id, filename: file.name || "", uploadedAt: new Date().toISOString() },
      });
      uploaded.push({
        key,
        url: `/api/media?key=${encodeURIComponent(key)}`,
        contentType: file.type,
        filename: file.name || "photo",
        size: file.size,
      });
    }

    return jsonResponse({ ok: true, files: uploaded }, 201);
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    return errorResponse("Failed to upload media", 500, "media_upload_failed");
  }
}

export async function DELETE(request: Request) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, request);
    if (!user) return errorResponse("Authentication required", 401, "unauthorized");

    const url = new URL(request.url);
    const key = String(url.searchParams.get("key") || "").trim();
    if (!key) return errorResponse("key is required", 400, "missing_media_key");
    if (!key.startsWith(`users/${user.id}/`)) {
      return errorResponse("not allowed", 403, "media_forbidden");
    }

    const reference = await db
      .prepare(
        `SELECT id
         FROM memories
         WHERE cover_photo_key = ?1
            OR EXISTS (
              SELECT 1
              FROM json_each(memories.photo_keys_json)
              WHERE json_each.value = ?1
            )
         LIMIT 1`,
      )
      .bind(key)
      .first<{ id: string }>();
    if (reference) {
      return errorResponse("Saved trace media must be removed from the trace editor", 409, "media_in_use");
    }

    const bucket = await requireBucket();
    await bucket.delete(key);
    return jsonResponse({ ok: true });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    return errorResponse("Failed to delete media", 500, "media_delete_failed");
  }
}

import type { R2Bucket } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSessionUser } from "@/lib/server/auth";
import { requireDb, HttpError } from "@/lib/server/cf";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { randomId } from "@/lib/server/crypto";

export const runtime = "edge";

const MAX_UPLOADS = 6;
const MAX_FILE_SIZE = 8 * 1024 * 1024;

async function requireBucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  const bucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA;
  if (!bucket) {
    throw new HttpError(errorResponse("MEDIA bucket is not configured", 500, "media_bucket_missing"));
  }
  return bucket;
}

export async function GET(request: Request) {
  try {
    const bucket = await requireBucket();
    const url = new URL(request.url);
    const key = String(url.searchParams.get("key") || "").trim();
    if (!key) return errorResponse("key is required", 400, "missing_media_key");

    const object = await bucket.get(key);
    if (!object) return errorResponse("media not found", 404, "media_not_found");

    const headers = new Headers();
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
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
      .filter((item): item is File => item instanceof File && item.size > 0)
      .slice(0, MAX_UPLOADS);

    if (!files.length) return errorResponse("photos are required", 400, "missing_photos");

    const uploaded = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return errorResponse("file too large (max 8MB)", 400, "media_too_large");
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

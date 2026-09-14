import type { R2Bucket } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { HttpError, requireDb } from "@/lib/server/cf";
import { errorResponse } from "@/lib/server/http";
import { resolveSharedPhoto } from "@/lib/server/share-links";

export const dynamic = "force-dynamic";

/**
 * A photo of a shared trace, addressed by position under the token.
 *
 * Recipients never see a storage key. Keys embed the owner's account id, and a shared memory
 * has no business handing that out; indexing also leaves a recipient nothing to probe with,
 * since they cannot name a key at all.
 *
 * The token is re-resolved on every request, which is what makes revocation immediate for
 * photos and not just for the story.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; index: string }> },
) {
  try {
    const { token, index } = await params;
    const db = await requireDb();

    const resolved = await resolveSharedPhoto(db, token, Number.parseInt(index, 10));
    if (!resolved) {
      // Unknown token, revoked link, expired link, and out-of-range index are deliberately
      // indistinguishable.
      return errorResponse("not found", 404, "shared_media_unavailable");
    }

    const { env } = await getCloudflareContext({ async: true });
    const bucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA;
    if (!bucket) return errorResponse("MEDIA bucket is not configured", 500, "media_bucket_missing");

    const object = await bucket.get(resolved.key);
    if (!object) return errorResponse("not found", 404, "shared_media_unavailable");

    return new Response(object.body as ReadableStream, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
        // Short and private on purpose. A long or shared cache would let a revoked link keep
        // serving photos from an intermediary, which would make revocation a lie.
        "Cache-Control": "private, max-age=60",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("shared_media_failed", thrown);
    return errorResponse("Failed to load the shared photo", 500, "shared_media_failed");
  }
}

import type { R2Bucket } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSessionUser } from "@/lib/server/auth";
import { HttpError, requireDb } from "@/lib/server/cf";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";
import {
  MAX_ARCHIVE_BYTES,
  MAX_ARCHIVE_FILES,
  buildAccountExport,
} from "@/lib/server/account-data";
import { createZipStream, type ZipEntrySource } from "@/lib/server/zip";

export const dynamic = "force-dynamic";

/**
 * Complete account export as a ZIP containing the manifest and every photo (M3-007).
 *
 * This is the export that makes portability real: the JSON alone references photos by URL,
 * which is useless once the account is gone. Like the JSON export, it is available on every
 * plan.
 *
 * The archive is streamed and each photo is buffered only long enough to be written, so
 * memory stays flat. Guards exist for CPU rather than memory: checksumming a very large
 * archive inside one request would not finish.
 */
export async function GET(request: Request) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, request);
    if (!user) return errorResponse("Authentication required", 401, "unauthorized");

    const throttled = await checkRateLimit(db, request, "account_archive", 6, 60 * 60 * 1_000);
    if (throttled) return throttled;

    const { env } = await getCloudflareContext({ async: true });
    const bucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA;
    if (!bucket) return errorResponse("MEDIA bucket is not configured", 500, "media_bucket_missing");

    const payload = await buildAccountExport(db, user);

    if (payload.media.length > MAX_ARCHIVE_FILES) {
      return jsonResponse(
        {
          error: {
            code: "archive_too_many_files",
            message: `This Atlas holds ${payload.media.length} photos, more than the ${MAX_ARCHIVE_FILES} a single archive can carry. The JSON export contains everything, and individual traces can still be downloaded.`,
          },
          limits: { maxFiles: MAX_ARCHIVE_FILES, maxBytes: MAX_ARCHIVE_BYTES },
        },
        413,
      );
    }

    // Sizes come from R2 metadata, so an oversized archive is refused before any bytes are
    // read rather than failing halfway through a download.
    let totalBytes = 0;
    for (const item of payload.media) {
      const head = await bucket.head(item.key);
      totalBytes += Number(head?.size || 0);
    }
    if (totalBytes > MAX_ARCHIVE_BYTES) {
      return jsonResponse(
        {
          error: {
            code: "archive_too_large",
            message: `These photos total ${Math.round(totalBytes / (1024 * 1024))} MB, above the ${Math.round(MAX_ARCHIVE_BYTES / (1024 * 1024))} MB an archive can carry. The JSON export contains every trace, and individual traces can still be downloaded.`,
          },
          limits: { maxFiles: MAX_ARCHIVE_FILES, maxBytes: MAX_ARCHIVE_BYTES },
        },
        413,
      );
    }

    const entries: ZipEntrySource[] = [
      {
        name: "manifest.json",
        read: async () => new TextEncoder().encode(JSON.stringify(payload, null, 2)),
      },
      ...payload.media.map<ZipEntrySource>((item) => ({
        name: item.archivePath,
        // A missing object is skipped rather than failing the export, so one lost photo does
        // not cost the user the rest of their archive.
        read: async () => {
          const object = await bucket.get(item.key);
          if (!object) return null;
          return new Uint8Array(await object.arrayBuffer());
        },
      })),
    ];

    const filename = `triptrace-atlas-${payload.exportedAt.slice(0, 10)}.zip`;
    return new Response(createZipStream(entries) as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("account_archive_failed", thrown);
    return errorResponse("Archive export failed", 500, "account_archive_failed");
  }
}

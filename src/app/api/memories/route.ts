import type { R2Bucket } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireDb, HttpError } from "@/lib/server/cf";
import { getSessionUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
import { randomId } from "@/lib/server/crypto";
import { rowToMemory, safeParseArray, type MemoryRow } from "@/lib/server/memories";
import { ENTITLEMENT_CODES } from "@/lib/plans";
import {
  METRIC_TRACE_SAVES_TOTAL,
  assertImageCount,
  entitlementDeniedResponse,
  getEntitlements,
  incrementLifetimeCounter,
  permanentTraceUsage,
} from "@/lib/server/entitlements";
import { enqueueMediaCleanup, sweepMediaCleanup } from "@/lib/server/media-cleanup";
import { deleteShareLinksForMemory } from "@/lib/server/share-links";

export const dynamic = "force-dynamic";

async function requireBucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  const bucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA;
  if (!bucket) {
    throw new HttpError(errorResponse("MEDIA bucket is not configured", 500, "media_bucket_missing"));
  }
  return bucket;
}

function uniqueMediaKeys(photoKeysJson: string | null, coverPhotoKey: string | null) {
  return Array.from(
    new Set([...safeParseArray(photoKeysJson), coverPhotoKey].map((key) => String(key || "").trim()).filter(Boolean)),
  );
}

export async function GET(request: Request) {
  try {
    const db = await requireDb();
    const url = new URL(request.url);
    const own = url.searchParams.get("own") === "true";

    let rows;
    if (own) {
      const user = await getSessionUser(db, request);
      if (!user) return errorResponse("Authentication required", 401, "unauthorized");
      rows = await db
        .prepare(
          `SELECT memories.id, memories.title, memories.story, memories.place, memories.mood, memories.tags_json,
                  memories.photo_keys_json, memories.cover_photo_key, memories.is_public,
                  memories.created_at, memories.event_at, memories.date_precision,
                  memories.factual_summary, memories.people_json, memories.latitude, memories.longitude,
                  memories.facts_confirmed_at, memories.ai_source, memories.ai_model, memories.ai_generated_at,
                  users.id AS user_id, users.display_name
           FROM memories
           JOIN users ON users.id = memories.user_id
           WHERE memories.user_id = ?1
           ORDER BY memories.created_at DESC
           LIMIT 200`,
        )
        .bind(user.id)
        .all<MemoryRow>();
    } else {
      rows = await db
        .prepare(
          `SELECT memories.id, memories.title, memories.story, memories.place, memories.mood, memories.tags_json,
                  memories.photo_keys_json, memories.cover_photo_key, memories.is_public,
                  memories.created_at, memories.event_at, memories.date_precision,
                  memories.factual_summary, memories.people_json, memories.latitude, memories.longitude,
                  memories.facts_confirmed_at, memories.ai_source, memories.ai_model, memories.ai_generated_at,
                  users.id AS user_id, users.display_name
           FROM memories
           JOIN users ON users.id = memories.user_id
           WHERE memories.is_public = 1
           ORDER BY memories.created_at DESC
           LIMIT 100`,
        )
        .all<MemoryRow>();
    }

    const list = (rows.results || []).map(rowToMemory);
    return jsonResponse({ ok: true, memories: list });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    return errorResponse("Failed to list memories", 500, "memories_list_failed");
  }
}

type CreateBody = {
  title?: string;
  story?: string;
  place?: string;
  mood?: string;
  tags?: string[];
  photoKeys?: string[];
  coverPhotoKey?: string;
  isPublic?: boolean;
  eventAt?: string | null;
  datePrecision?: string;
  factualSummary?: string;
  people?: string[];
  latitude?: number | null;
  longitude?: number | null;
  factsConfirmed?: boolean;
  ai?: { source?: string; model?: string | null };
};

export async function POST(request: Request) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, request);
    if (!user) return errorResponse("Authentication required", 401, "unauthorized");

    const body = await readJson<CreateBody>(request);
    const title = String(body?.title || "").trim();
    const story = String(body?.story || "").trim();
    const place = String(body?.place || "").trim();
    const mood = String(body?.mood || "").trim();
    const tags = Array.isArray(body?.tags) ? body.tags.map((x) => String(x).trim()).filter(Boolean) : [];
    const photoKeys = Array.isArray(body?.photoKeys)
      ? body.photoKeys.map((x) => String(x).trim()).filter(Boolean)
      : [];
    const coverPhotoKey = String(body?.coverPhotoKey || photoKeys[0] || "").trim() || null;
    const isPublic = body?.isPublic === true ? 1 : 0;
    const eventAt = String(body?.eventAt || "").trim() || null;
    const datePrecision = String(body?.datePrecision || (eventAt ? "day" : "unknown")).trim();
    const factualSummary = String(body?.factualSummary || "").trim();
    const people = Array.isArray(body?.people)
      ? body.people.map((person) => String(person).trim()).filter(Boolean).slice(0, 30)
      : [];
    const latitude = Number.isFinite(body?.latitude) ? Number(body?.latitude) : null;
    const longitude = Number.isFinite(body?.longitude) ? Number(body?.longitude) : null;
    const factsConfirmedAt = body?.factsConfirmed === true ? new Date().toISOString() : null;
    const aiSource = String(body?.ai?.source || "").trim() || null;
    const aiModel = String(body?.ai?.model || "").trim() || null;

    if (!title || !story) {
      return errorResponse("title and story are required", 400, "missing_fields");
    }
    if (!factsConfirmedAt) {
      return errorResponse("Confirm the trace facts before saving", 400, "facts_not_confirmed");
    }

    const entitlements = await getEntitlements(db, user, request);
    const imageDenial = assertImageCount(entitlements, photoKeys.length);
    if (imageDenial) return imageDenial;

    const id = randomId("mem_");
    const createdAt = new Date().toISOString();
    // The stored-trace limit is enforced inside the insert statement so two concurrent
    // saves cannot both pass a separate count check and land an extra row.
    const insert = await db
      .prepare(
        `INSERT INTO memories (
           id, user_id, title, story, place, mood, tags_json, photo_keys_json, cover_photo_key,
           is_public, created_at, event_at, date_precision, factual_summary, people_json,
           latitude, longitude, facts_confirmed_at, ai_source, ai_model, ai_generated_at
         )
         SELECT
           ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15,
           ?16, ?17, ?18, ?19, ?20, ?21
         WHERE (SELECT COUNT(*) FROM memories WHERE user_id = ?2) < ?22`,
      )
      .bind(
        id,
        user.id,
        title,
        story,
        place || null,
        mood || null,
        JSON.stringify(tags.slice(0, 10)),
        JSON.stringify(photoKeys),
        coverPhotoKey,
        isPublic,
        createdAt,
        eventAt,
        datePrecision,
        factualSummary || null,
        JSON.stringify(people),
        latitude,
        longitude,
        factsConfirmedAt,
        aiSource,
        aiModel,
        aiSource === "openai" ? createdAt : null,
        entitlements.limits.permanentTraces,
      )
      .run();

    if (Number(insert.meta?.changes || 0) === 0) {
      const current = await permanentTraceUsage(db, entitlements);
      return entitlementDeniedResponse({
        code: ENTITLEMENT_CODES.traceLimitReached,
        planKey: entitlements.planKey,
        limit: current.limit,
        used: current.used,
      });
    }

    // Counted after the insert succeeds, and counted for the lifetime of the account, so
    // the activation event stays a once-per-user fact even if the user later deletes
    // every trace and saves again.
    const lifetimeSaves = await incrementLifetimeCounter(db, user.id, METRIC_TRACE_SAVES_TOTAL);

    return jsonResponse(
      { ok: true, memory: { id, createdAt, isFirstTrace: lifetimeSaves === 1 } },
      201,
    );
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("memory_create_failed", thrown);
    return errorResponse("Failed to create memory", 500, "memory_create_failed");
  }
}

export async function PATCH(request: Request) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, request);
    if (!user) return errorResponse("Authentication required", 401, "unauthorized");

    const url = new URL(request.url);
    const memoryId = String(url.searchParams.get("memoryId") || "").trim();
    if (!memoryId) return errorResponse("memoryId is required", 400, "missing_memory_id");

    const existing = await db
      .prepare("SELECT id, user_id FROM memories WHERE id = ?1")
      .bind(memoryId)
      .first<{ id: string; user_id: string }>();
    if (!existing) return errorResponse("memory not found", 404, "memory_not_found");
    if (existing.user_id !== user.id) return errorResponse("not allowed", 403, "forbidden");

    const body = await readJson<CreateBody & { isPublic?: boolean }>(request);
    if (!body) return errorResponse("invalid body", 400, "invalid_body");

    const updates: string[] = [];
    const binds: unknown[] = [];
    let i = 1;

    if ("isPublic" in body) {
      updates.push(`is_public = ?${i++}`);
      binds.push(body.isPublic ? 1 : 0);
    }
    if ("title" in body && String(body.title).trim()) {
      updates.push(`title = ?${i++}`);
      binds.push(String(body.title).trim());
    }
    if ("story" in body && String(body.story).trim()) {
      updates.push(`story = ?${i++}`);
      binds.push(String(body.story).trim());
    }
    if ("tags" in body && Array.isArray(body.tags)) {
      updates.push(`tags_json = ?${i++}`);
      binds.push(JSON.stringify(body.tags.map((x) => String(x).trim()).filter(Boolean).slice(0, 10)));
    }
    if ("place" in body) {
      updates.push(`place = ?${i++}`);
      binds.push(String(body.place || "").trim() || null);
    }
    if ("mood" in body) {
      updates.push(`mood = ?${i++}`);
      binds.push(String(body.mood || "").trim() || null);
    }
    const touchesFacts =
      "eventAt" in body ||
      "datePrecision" in body ||
      "factualSummary" in body ||
      "people" in body ||
      "latitude" in body ||
      "longitude" in body;
    if (touchesFacts && body.factsConfirmed !== true) {
      return errorResponse("Confirm the trace facts before saving", 400, "facts_not_confirmed");
    }
    if ("eventAt" in body) {
      updates.push(`event_at = ?${i++}`);
      binds.push(String(body.eventAt || "").trim() || null);
    }
    if ("datePrecision" in body) {
      updates.push(`date_precision = ?${i++}`);
      binds.push(String(body.datePrecision || "").trim() || "unknown");
    }
    if ("factualSummary" in body) {
      updates.push(`factual_summary = ?${i++}`);
      binds.push(String(body.factualSummary || "").trim() || null);
    }
    if ("people" in body && Array.isArray(body.people)) {
      updates.push(`people_json = ?${i++}`);
      binds.push(JSON.stringify(body.people.map((person) => String(person).trim()).filter(Boolean).slice(0, 30)));
    }
    if ("latitude" in body) {
      updates.push(`latitude = ?${i++}`);
      binds.push(Number.isFinite(body.latitude) ? Number(body.latitude) : null);
    }
    if ("longitude" in body) {
      updates.push(`longitude = ?${i++}`);
      binds.push(Number.isFinite(body.longitude) ? Number(body.longitude) : null);
    }
    if (touchesFacts || body.factsConfirmed === true) {
      updates.push(`facts_confirmed_at = ?${i++}`);
      binds.push(new Date().toISOString());
    }
    if ("photoKeys" in body && Array.isArray(body.photoKeys)) {
      const keys = body.photoKeys.map((x) => String(x).trim()).filter(Boolean);
      const patchEntitlements = await getEntitlements(db, user, request);
      const patchImageDenial = assertImageCount(patchEntitlements, keys.length);
      if (patchImageDenial) return patchImageDenial;
      updates.push(`photo_keys_json = ?${i++}`);
      binds.push(JSON.stringify(keys));
      if (!("coverPhotoKey" in body)) {
        updates.push(`cover_photo_key = ?${i++}`);
        binds.push(String(body.coverPhotoKey || keys[0] || "").trim() || null);
      }
    }
    if ("coverPhotoKey" in body) {
      updates.push(`cover_photo_key = ?${i++}`);
      binds.push(String(body.coverPhotoKey || "").trim() || null);
    }

    if (!updates.length) return jsonResponse({ ok: true });

    binds.push(memoryId);
    await db
      .prepare(`UPDATE memories SET ${updates.join(", ")} WHERE id = ?${i}`)
      .bind(...binds)
      .run();

    return jsonResponse({ ok: true });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    return errorResponse("Failed to update memory", 500, "memory_update_failed");
  }
}

export async function DELETE(request: Request) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, request);
    if (!user) return errorResponse("Authentication required", 401, "unauthorized");

    const url = new URL(request.url);
    const memoryId = String(url.searchParams.get("memoryId") || "").trim();
    if (!memoryId) return errorResponse("memoryId is required", 400, "missing_memory_id");

    const existing = await db
      .prepare("SELECT id, user_id, photo_keys_json, cover_photo_key FROM memories WHERE id = ?1")
      .bind(memoryId)
      .first<{ id: string; user_id: string; photo_keys_json: string | null; cover_photo_key: string | null }>();
    if (!existing) return errorResponse("memory not found", 404, "memory_not_found");
    if (existing.user_id !== user.id) return errorResponse("not allowed", 403, "forbidden");

    const mediaKeys = uniqueMediaKeys(existing.photo_keys_json, existing.cover_photo_key);

    await db.prepare("DELETE FROM comments WHERE memory_id = ?1").bind(memoryId).run();
    // Share links go with the trace. A live link pointing at a deleted memory would be a
    // dangling capability.
    const revokedLinks = await deleteShareLinksForMemory(db, memoryId);
    await db.prepare("DELETE FROM memories WHERE id = ?1 AND user_id = ?2").bind(memoryId, user.id).run();

    // The row is already gone, so the media is unreachable through the API from here on:
    // access is authorised by looking up a referencing trace. Removing the R2 object is a
    // separate step, and a failure there must not be reported once and forgotten, or the
    // bucket keeps a file the user believes is deleted.
    let mediaCleanupFailed = false;
    let mediaQueued = 0;
    if (mediaKeys.length > 0) {
      try {
        const bucket = await requireBucket();
        await bucket.delete(mediaKeys);
      } catch (thrown) {
        mediaCleanupFailed = true;
        mediaQueued = await enqueueMediaCleanup(db, {
          keys: mediaKeys,
          userId: user.id,
          memoryId,
          error: thrown instanceof Error ? thrown.message : "bucket_delete_failed",
        });
      }
    }

    // Opportunistic drain, so a recovered bucket heals without waiting for a scheduler.
    // Scoped to this user's own keys and bounded, and never allowed to fail the deletion
    // the user actually asked for.
    let mediaRetried = 0;
    try {
      const bucket = await requireBucket();
      const swept = await sweepMediaCleanup(db, bucket, { userId: user.id, limit: 5 });
      mediaRetried = swept.deleted;
    } catch {
      // Nothing to report: the queue keeps the work for the next attempt.
    }

    return jsonResponse({
      ok: true,
      deleted: {
        memoryId,
        mediaKeys: mediaKeys.length,
        mediaCleanupFailed,
        mediaQueuedForRetry: mediaQueued,
        mediaRetriedFromQueue: mediaRetried,
        shareLinksRemoved: revokedLinks,
      },
    });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    return errorResponse("Failed to delete memory", 500, "memory_delete_failed");
  }
}

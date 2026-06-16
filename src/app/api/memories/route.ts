import { requireDb, HttpError } from "@/lib/server/cf";
import { getSessionUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
import { randomId } from "@/lib/server/crypto";
import { rowToMemory, type MemoryRow } from "@/lib/server/memories";

export const runtime = "edge";

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
                  memories.created_at, users.id AS user_id, users.display_name
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
                  memories.created_at, users.id AS user_id, users.display_name
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
      ? body.photoKeys.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
      : [];
    const coverPhotoKey = String(body?.coverPhotoKey || photoKeys[0] || "").trim() || null;
    const isPublic = body?.isPublic !== false ? 1 : 0;

    if (!title || !story) {
      return errorResponse("title and story are required", 400, "missing_fields");
    }

    const id = randomId("mem_");
    const createdAt = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO memories (id, user_id, title, story, place, mood, tags_json, photo_keys_json, cover_photo_key, is_public, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
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
      )
      .run();

    return jsonResponse({ ok: true, memory: { id, createdAt } }, 201);
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
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
    if ("photoKeys" in body && Array.isArray(body.photoKeys)) {
      const keys = body.photoKeys.map((x) => String(x).trim()).filter(Boolean).slice(0, 6);
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

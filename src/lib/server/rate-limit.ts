// Ported from triptrace.ai/functions/_lib/rate-limit.js
import type { D1Database } from "@cloudflare/workers-types";
import { jsonResponse } from "./http";

let schemaReady = false;

export function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "local"
  );
}

export async function checkRateLimit(
  db: D1Database,
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
): Promise<Response | null> {
  await ensureSchema(db);

  const ip = getClientIp(request);
  const bucketStart = Math.floor(Date.now() / windowMs) * windowMs;
  const bucketKey = `${scope}:${ip}:${bucketStart}`;
  const current = await db
    .prepare("SELECT count FROM rate_limits WHERE bucket_key = ?1")
    .bind(bucketKey)
    .first<{ count: number }>();
  const count = Number(current?.count || 0);

  if (count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucketStart + windowMs - Date.now()) / 1000));
    return jsonResponse(
      { ok: false, error: { code: "rate_limited", message: "Too many requests, please try again later." } },
      429,
      { "Retry-After": String(retryAfterSeconds) },
    );
  }

  await db
    .prepare(
      `INSERT OR REPLACE INTO rate_limits (bucket_key, count, window_start, updated_at)
       VALUES (?1, ?2, ?3, ?4)`,
    )
    .bind(bucketKey, count + 1, new Date(bucketStart).toISOString(), new Date().toISOString())
    .run();

  return null;
}

async function ensureSchema(db: D1Database) {
  if (schemaReady) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS rate_limits (
        bucket_key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        window_start TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    )
    .run();
  schemaReady = true;
}

/**
 * Selected-trace share links (M3-005) and revocation (M3-006).
 *
 * Everything here exists to keep one hole in a private-by-default product as small as
 * possible:
 *
 *  - A link grants read access to exactly one trace. There is no "share my Atlas".
 *  - A link is only created by an explicit action on a specific trace.
 *  - A link can be revoked, and revocation takes effect on the next request because every
 *    read re-resolves the link rather than trusting a cached decision.
 *  - The token is stored hashed, so a database dump yields no working URLs.
 *  - Shared payloads are shaped here, not taken wholesale from the trace, so the owner's
 *    email and exact position never travel with a shared memory.
 */
import type { D1Database } from "@cloudflare/workers-types";
import { rowToMemory, safeParseArray, type MemoryRow } from "./memories";
import { randomId } from "./crypto";

/** Token length in bytes before encoding. 128 bits makes guessing infeasible. */
const TOKEN_BYTES = 16;

export const MAX_LINKS_PER_TRACE = 10;

/**
 * Precision of coordinates in a shared payload.
 *
 * Two decimals is roughly a kilometre. Enough for a recipient to see the neighbourhood a
 * memory belongs to, not enough to point at a home. Sharing a memory should not mean
 * sharing an address.
 */
const SHARED_COORDINATE_DECIMALS = 2;

export function generateShareToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // URL-safe base64 without padding, so the token can sit in a path segment.
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function hashShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function tokenPrefix(token: string): string {
  return token.slice(0, 6);
}

/** Tokens are fixed-shape, so anything else is rejected before touching the database. */
export function isPlausibleShareToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,24}$/.test(value.trim());
}

export type ShareLinkRow = {
  id: string;
  memory_id: string;
  user_id: string;
  token_prefix: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
};

export type ShareLinkSummary = {
  id: string;
  memoryId: string;
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  active: boolean;
  viewCount: number;
  lastViewedAt: string | null;
};

export function isActive(row: Pick<ShareLinkRow, "revoked_at" | "expires_at">, now = Date.now()): boolean {
  if (row.revoked_at) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return false;
  return true;
}

export function toSummary(row: ShareLinkRow): ShareLinkSummary {
  return {
    id: row.id,
    memoryId: row.memory_id,
    prefix: row.token_prefix,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    active: isActive(row),
    viewCount: Number(row.view_count || 0),
    lastViewedAt: row.last_viewed_at,
  };
}

export async function createShareLink(
  db: D1Database,
  input: { memoryId: string; userId: string; expiresAt?: string | null },
): Promise<{ token: string; summary: ShareLinkSummary }> {
  const token = generateShareToken();
  const id = randomId("shr_");
  const createdAt = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO share_links (
         id, memory_id, user_id, token_hash, token_prefix, created_at, expires_at
       )
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(id, input.memoryId, input.userId, await hashShareToken(token), tokenPrefix(token), createdAt, input.expiresAt ?? null)
    .run();

  return {
    token,
    summary: {
      id,
      memoryId: input.memoryId,
      prefix: tokenPrefix(token),
      createdAt,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      active: true,
      viewCount: 0,
      lastViewedAt: null,
    },
  };
}

export async function listShareLinks(
  db: D1Database,
  userId: string,
  memoryId?: string,
): Promise<ShareLinkSummary[]> {
  const columns = `id, memory_id, user_id, token_prefix, created_at, expires_at, revoked_at, view_count, last_viewed_at`;
  const rows = memoryId
    ? await db
        .prepare(`SELECT ${columns} FROM share_links WHERE user_id = ?1 AND memory_id = ?2 ORDER BY created_at DESC`)
        .bind(userId, memoryId)
        .all<ShareLinkRow>()
    : await db
        .prepare(`SELECT ${columns} FROM share_links WHERE user_id = ?1 ORDER BY created_at DESC`)
        .bind(userId)
        .all<ShareLinkRow>();
  return (rows.results || []).map(toSummary);
}

export async function countActiveLinks(db: D1Database, memoryId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM share_links
       WHERE memory_id = ?1 AND revoked_at IS NULL`,
    )
    .bind(memoryId)
    .first<{ count: number }>();
  return Number(row?.count || 0);
}

/** Revokes a link the caller owns. Returns false when it is not theirs or does not exist. */
export async function revokeShareLink(db: D1Database, userId: string, linkId: string): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE share_links SET revoked_at = ?3
       WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL`,
    )
    .bind(linkId, userId, new Date().toISOString())
    .run();
  return Number(result.meta?.changes || 0) > 0;
}

const SHARED_MEMORY_COLUMNS = `memories.id, memories.title, memories.story, memories.place, memories.mood,
  memories.tags_json, memories.photo_keys_json, memories.cover_photo_key, memories.is_public,
  memories.created_at, memories.event_at, memories.date_precision, memories.factual_summary,
  memories.people_json, memories.latitude, memories.longitude, memories.facts_confirmed_at,
  memories.ai_source, memories.ai_model, memories.ai_generated_at,
  users.id AS user_id, users.display_name`;

export type ResolvedShare = {
  link: ShareLinkRow;
  row: MemoryRow;
};

/**
 * Resolves a token to its trace, or null when the link is unknown, revoked, or expired.
 *
 * Called on every request, which is what makes revocation immediate.
 */
export async function resolveShareToken(db: D1Database, token: string): Promise<ResolvedShare | null> {
  if (!isPlausibleShareToken(token)) return null;

  const link = await db
    .prepare(
      `SELECT id, memory_id, user_id, token_prefix, created_at, expires_at, revoked_at, view_count, last_viewed_at
       FROM share_links WHERE token_hash = ?1`,
    )
    .bind(await hashShareToken(token.trim()))
    .first<ShareLinkRow>();
  if (!link || !isActive(link)) return null;

  const row = await db
    .prepare(
      `SELECT ${SHARED_MEMORY_COLUMNS}
       FROM memories JOIN users ON users.id = memories.user_id
       WHERE memories.id = ?1`,
    )
    .bind(link.memory_id)
    .first<MemoryRow>();
  if (!row) return null;

  return { link, row };
}

/** Photo keys of a shared trace, in the order the owner arranged them. */
export function sharedPhotoKeys(resolved: ResolvedShare): string[] {
  return safeParseArray(resolved.row.photo_keys_json)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

/**
 * Resolves a positional photo reference for a shared trace.
 *
 * Recipients address photos by index rather than by storage key. A key contains the owner's
 * account id, and a shared memory has no business handing that out. Indexing also means a
 * recipient cannot name a key at all, so there is nothing to probe with.
 */
export async function resolveSharedPhoto(
  db: D1Database,
  token: string,
  index: number,
): Promise<{ key: string } | null> {
  if (!Number.isInteger(index) || index < 0) return null;
  const resolved = await resolveShareToken(db, token);
  if (!resolved) return null;
  const keys = sharedPhotoKeys(resolved);
  const key = keys[index];
  return key ? { key } : null;
}

export async function recordShareView(db: D1Database, linkId: string): Promise<void> {
  await db
    .prepare("UPDATE share_links SET view_count = view_count + 1, last_viewed_at = ?2 WHERE id = ?1")
    .bind(linkId, new Date().toISOString())
    .run();
}

function roundCoordinate(value: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const factor = 10 ** SHARED_COORDINATE_DECIMALS;
  return Math.round(value * factor) / factor;
}

export type SharedTrace = {
  title: string;
  story: string;
  tags: string[];
  place: string | null;
  mood: string | null;
  eventAt: string | null;
  datePrecision: string;
  factualSummary: string;
  people: string[];
  /** Rounded to about a kilometre. Sharing a memory must not share an address. */
  approximateLatitude: number | null;
  approximateLongitude: number | null;
  coordinatePrecisionKm: number;
  photoUrls: string[];
  ai: { source: string; model: string | null };
  sharedBy: string;
  sharedAt: string;
};

/**
 * Shapes the public payload.
 *
 * Built field by field on purpose. Returning the stored trace directly would leak the
 * owner's account id, their email through the joined user record, exact coordinates, and any
 * field added to traces later. An allowlist fails closed as the schema grows.
 */
export function toSharedTrace(resolved: ResolvedShare, token: string): SharedTrace {
  const memory = rowToMemory(resolved.row);
  return {
    title: memory.title,
    story: memory.story,
    tags: memory.tags,
    place: memory.place,
    mood: memory.mood,
    eventAt: memory.eventAt,
    datePrecision: memory.datePrecision,
    factualSummary: memory.factualSummary,
    people: memory.people,
    approximateLatitude: roundCoordinate(memory.latitude),
    approximateLongitude: roundCoordinate(memory.longitude),
    coordinatePrecisionKm: 1,
    // Photos are addressed by position under the token, never by storage key. A key embeds
    // the owner's account id, and the link stays the single gate for the photos as well as
    // the story.
    photoUrls: memory.photoKeys.map(
      (_key, index) => `/api/shared/${encodeURIComponent(token)}/media/${index}`,
    ),
    ai: { source: memory.ai.source, model: memory.ai.model },
    sharedBy: resolved.row.display_name,
    sharedAt: resolved.link.created_at,
  };
}

/** Removes links for a trace, used when the trace itself is deleted. */
export async function deleteShareLinksForMemory(db: D1Database, memoryId: string): Promise<number> {
  const result = await db.prepare("DELETE FROM share_links WHERE memory_id = ?1").bind(memoryId).run();
  return Number(result.meta?.changes || 0);
}

export async function deleteShareLinksForUser(db: D1Database, userId: string): Promise<number> {
  const result = await db.prepare("DELETE FROM share_links WHERE user_id = ?1").bind(userId).run();
  return Number(result.meta?.changes || 0);
}

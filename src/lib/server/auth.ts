// Ported from triptrace.ai/functions/_lib/auth.js (cookie name & session table are shared
// with the existing D1 database, so sessions created here use the same schema).
import type { D1Database } from "@cloudflare/workers-types";
import { cookieHeader, getCookie } from "./http";
import { randomId } from "./crypto";

const SESSION_COOKIE = "tt_session";

export function sessionCookieName() {
  return SESSION_COOKIE;
}

export function buildSessionCookie(request: Request, token: string, maxAgeSeconds: number) {
  const secure = request.url.startsWith("https://");
  return cookieHeader(SESSION_COOKIE, token, { maxAge: maxAgeSeconds, secure });
}

export function clearSessionCookie(request: Request) {
  const secure = request.url.startsWith("https://");
  return cookieHeader(SESSION_COOKIE, "", { maxAge: 0, secure });
}

function nowIso() {
  return new Date().toISOString();
}
function plusDaysIso(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

export async function createSession(db: D1Database, userId: string, ttlDays = 30) {
  const sessionId = randomId("sess_");
  const createdAt = nowIso();
  const expiresAt = plusDaysIso(ttlDays);
  await db
    .prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(sessionId, userId, createdAt, expiresAt)
    .run();
  return { id: sessionId, maxAge: ttlDays * 86400 };
}

export type SessionUser = {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
};

export async function getSessionUser(db: D1Database, request: Request): Promise<SessionUser | null> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const result = await db
    .prepare(
      `SELECT users.id, users.email, users.display_name, users.created_at
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ?1 AND sessions.expires_at > ?2`,
    )
    .bind(token, nowIso())
    .first<SessionUser>();
  return result ?? null;
}

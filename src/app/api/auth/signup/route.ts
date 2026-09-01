import { requireDb, HttpError } from "@/lib/server/cf";
import { hashPassword, randomId } from "@/lib/server/crypto";
import { buildSessionCookie, createSession } from "@/lib/server/auth";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const db = await requireDb();
    const body = await readJson<{ email?: string; password?: string; displayName?: string }>(request);
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const displayName = String(body?.displayName || "").trim() || email.split("@")[0] || "user";

    if (!email || !email.includes("@")) {
      return errorResponse("Valid email is required", 400, "invalid_email");
    }
    if (password.length < 8) {
      return errorResponse("Password must be at least 8 characters", 400, "weak_password");
    }

    const limited = await checkRateLimit(db, request, "signup", 10, 15 * 60 * 1000);
    if (limited) return limited;

    const existing = await db.prepare("SELECT id FROM users WHERE email = ?1").bind(email).first();
    if (existing) {
      return errorResponse("Email already registered", 409, "email_exists");
    }

    const userId = randomId("usr_");
    const passwordHash = await hashPassword(password);
    const createdAt = new Date().toISOString();
    await db
      .prepare("INSERT INTO users (id, email, password_hash, display_name, created_at) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(userId, email, passwordHash, displayName, createdAt)
      .run();

    const session = await createSession(db, userId);
    return jsonResponse(
      { ok: true, user: { id: userId, email, displayName, createdAt } },
      201,
      { "Set-Cookie": buildSessionCookie(request, session.id, session.maxAge) },
    );
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    const message = thrown instanceof Error ? thrown.message : "Unknown signup error";
    console.error("signup_failed", thrown);
    return errorResponse(`Failed to sign up: ${message}`, 500, "signup_failed");
  }
}

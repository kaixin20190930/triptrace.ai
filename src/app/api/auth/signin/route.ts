import { requireDb, HttpError } from "@/lib/server/cf";
import { verifyPassword } from "@/lib/server/crypto";
import { buildSessionCookie, createSession } from "@/lib/server/auth";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const db = await requireDb();
    const body = await readJson<{ email?: string; password?: string }>(request);
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      return errorResponse("Email and password are required", 400, "missing_credentials");
    }

    const limited = await checkRateLimit(db, request, "signin", 10, 10 * 60 * 1000);
    if (limited) return limited;

    const user = await db
      .prepare("SELECT id, email, display_name, password_hash, created_at FROM users WHERE email = ?1")
      .bind(email)
      .first<{ id: string; email: string; display_name: string; password_hash: string; created_at: string }>();
    if (!user) {
      return errorResponse("Invalid email or password", 401, "invalid_credentials");
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return errorResponse("Invalid email or password", 401, "invalid_credentials");
    }

    const session = await createSession(db, user.id);
    return jsonResponse(
      {
        ok: true,
        user: { id: user.id, email: user.email, displayName: user.display_name, createdAt: user.created_at },
      },
      200,
      { "Set-Cookie": buildSessionCookie(request, session.id, session.maxAge) },
    );
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    return errorResponse("Failed to sign in", 500, "signin_failed");
  }
}

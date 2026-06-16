import { requireDb, HttpError } from "@/lib/server/cf";
import { clearSessionCookie, sessionCookieName } from "@/lib/server/auth";
import { errorResponse, getCookie, jsonResponse } from "@/lib/server/http";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const db = await requireDb();
    const sessionId = getCookie(request, sessionCookieName());
    if (sessionId) {
      await db.prepare("DELETE FROM sessions WHERE id = ?1").bind(sessionId).run();
    }
    return jsonResponse({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(request) });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    return errorResponse("Failed to sign out", 500, "signout_failed");
  }
}

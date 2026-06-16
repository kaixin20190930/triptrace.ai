import { requireDb, HttpError } from "@/lib/server/cf";
import { getSessionUser } from "@/lib/server/auth";
import { errorResponse, jsonResponse } from "@/lib/server/http";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, request);
    if (!user) return jsonResponse({ ok: true, user: null });
    return jsonResponse({
      ok: true,
      user: { id: user.id, email: user.email, displayName: user.display_name, createdAt: user.created_at },
    });
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    return errorResponse("Failed to load session", 500, "me_failed");
  }
}

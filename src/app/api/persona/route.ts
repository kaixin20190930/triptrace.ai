import { type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { requireDb } from "@/lib/server/cf";
import { jsonResponse, errorResponse, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, req);
    if (!user) return errorResponse("Authentication required", 401, "unauthorized");
    const row = await db
      .prepare("SELECT persona_json FROM users WHERE id = ?1")
      .bind(user.id)
      .first<{ persona_json: string | null }>();
    const persona = row?.persona_json ? JSON.parse(row.persona_json) : null;
    return jsonResponse({ ok: true, persona });
  } catch (thrown) {
    if (thrown instanceof Response) return thrown;
    return errorResponse("Failed to get persona", 500, "persona_get_failed");
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await requireDb();
    const user = await getSessionUser(db, req);
    if (!user) return errorResponse("Authentication required", 401, "unauthorized");

    const body = await readJson<Record<string, unknown>>(req);
    if (!body || typeof body !== "object") {
      return errorResponse("invalid body", 400, "invalid_body");
    }

    const existing = await db
      .prepare("SELECT persona_json FROM users WHERE id = ?1")
      .bind(user.id)
      .first<{ persona_json: string | null }>();
    const prev: Record<string, unknown> = existing?.persona_json
      ? JSON.parse(existing.persona_json)
      : {};

    // Keep history of derivedPersona changes (max 10)
    const history: unknown[] = Array.isArray(prev.history) ? (prev.history as unknown[]) : [];
    const prevDP = prev.derivedPersona ? JSON.stringify(prev.derivedPersona) : null;
    const nextDP = body.derivedPersona ? JSON.stringify(body.derivedPersona) : prevDP;
    if (prevDP && nextDP && prevDP !== nextDP) {
      history.push({
        derivedPersona: prev.derivedPersona,
        sampleText: prev.sampleText,
        savedAt: prev.lastUpdated || new Date().toISOString(),
      });
      if (history.length > 10) history.shift();
    }

    const next = {
      ...prev,
      ...body,
      history,
      lastUpdated: new Date().toISOString(),
      updateCount: ((prev.updateCount as number) || 0) + 1,
    };
    await db
      .prepare("UPDATE users SET persona_json = ?1 WHERE id = ?2")
      .bind(JSON.stringify(next), user.id)
      .run();
    return jsonResponse({ ok: true, persona: next });
  } catch (thrown) {
    if (thrown instanceof Response) return thrown;
    return errorResponse("Failed to save persona", 500, "persona_save_failed");
  }
}

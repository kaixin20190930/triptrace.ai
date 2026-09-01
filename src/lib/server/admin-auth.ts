// Shared gate for operator-only endpoints.
//
// These routes read across every account or delete data, so they fail shut: with no
// `ADMIN_TASK_TOKEN` configured they are disabled entirely rather than left open.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { errorResponse } from "./http";

export const ADMIN_TOKEN_HEADER = "x-triptrace-admin-token";

export async function requireAdminToken(request: Request): Promise<Response | null> {
  const { env } = await getCloudflareContext({ async: true });
  const expected = (env as unknown as { ADMIN_TASK_TOKEN?: string }).ADMIN_TASK_TOKEN;

  if (!expected) {
    return errorResponse(
      "ADMIN_TASK_TOKEN is not configured, so administrative tasks are disabled.",
      503,
      "admin_token_missing",
    );
  }

  const provided = request.headers.get(ADMIN_TOKEN_HEADER) || "";
  if (provided.length !== expected.length) {
    return errorResponse("not allowed", 403, "admin_forbidden");
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (diff !== 0) return errorResponse("not allowed", 403, "admin_forbidden");

  return null;
}

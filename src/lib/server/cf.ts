import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";
import { errorResponse } from "./http";

export class HttpError extends Error {
  constructor(public response: Response) {
    super("HttpError");
  }
}

export async function requireDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) {
    throw new HttpError(
      errorResponse(
        "D1 binding `DB` is missing. Add a D1 database binding named `DB` in Cloudflare Pages settings.",
        500,
        "db_binding_missing",
      ),
    );
  }
  return db;
}

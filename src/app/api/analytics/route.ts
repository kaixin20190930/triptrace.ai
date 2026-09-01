import type { D1Database } from "@cloudflare/workers-types";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSessionUser } from "@/lib/server/auth";
import { HttpError, requireDb } from "@/lib/server/cf";
import { randomId } from "@/lib/server/crypto";
import { deleteExpiredAnalyticsEvents } from "@/lib/server/analytics-retention";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { checkRateLimit } from "@/lib/server/rate-limit";
import {
  isAnalyticsEventName,
  sanitizeAnalyticsProperties,
} from "@/lib/analytics-events";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_192;
const MAX_CLIENT_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const CLIENT_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

type AnalyticsBody = {
  eventName?: unknown;
  anonymousId?: unknown;
  sessionId?: unknown;
  occurredAt?: unknown;
  properties?: unknown;
};

function validClientId(value: unknown, required: boolean) {
  if (value === undefined || value === null || value === "") return required ? null : undefined;
  const clean = String(value).trim();
  return CLIENT_ID_PATTERN.test(clean) ? clean : null;
}

const RETENTION_SWEEP_PROBABILITY = 0.01;

async function scheduleRetentionSweep(db: D1Database) {
  if (Math.random() >= RETENTION_SWEEP_PROBABILITY) return;
  try {
    const { ctx } = await getCloudflareContext({ async: true });
    const sweep = deleteExpiredAnalyticsEvents(db).catch(() => undefined);
    if (ctx?.waitUntil) {
      ctx.waitUntil(sweep);
    } else {
      await sweep;
    }
  } catch {
    // Retention is best-effort here; the admin endpoint is the guaranteed path.
  }
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return errorResponse("Analytics payload is too large", 413, "payload_too_large");
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return errorResponse("Analytics payload is too large", 413, "payload_too_large");
    }

    let body: AnalyticsBody;
    try {
      body = JSON.parse(rawBody) as AnalyticsBody;
    } catch {
      return errorResponse("Invalid analytics payload", 400, "invalid_body");
    }

    if (!isAnalyticsEventName(body.eventName)) {
      return errorResponse("Unsupported analytics event", 400, "invalid_event");
    }

    const anonymousId = validClientId(body.anonymousId, true);
    const sessionId = validClientId(body.sessionId, false);
    if (!anonymousId || sessionId === null) {
      return errorResponse("Invalid analytics identifier", 400, "invalid_identifier");
    }

    const occurredAt = new Date(String(body.occurredAt || ""));
    const occurredAtMs = occurredAt.getTime();
    const now = Date.now();
    if (
      !Number.isFinite(occurredAtMs) ||
      occurredAtMs < now - MAX_CLIENT_EVENT_AGE_MS ||
      occurredAtMs > now + MAX_FUTURE_SKEW_MS
    ) {
      return errorResponse("Invalid analytics timestamp", 400, "invalid_timestamp");
    }

    const db = await requireDb();
    const limited = await checkRateLimit(db, request, "analytics", 120, 5 * 60 * 1_000);
    if (limited) return limited;

    const user = await getSessionUser(db, request);
    const receivedAt = new Date().toISOString();
    const properties = sanitizeAnalyticsProperties(body.eventName, body.properties);

    await db
      .prepare(
        `INSERT INTO analytics_events (
           id, event_name, anonymous_id, user_id, session_id,
           properties_json, occurred_at, received_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .bind(
        randomId("evt_"),
        body.eventName,
        anonymousId,
        user?.id ?? null,
        sessionId ?? null,
        JSON.stringify(properties),
        occurredAt.toISOString(),
        receivedAt,
      )
      .run();

    // Retention is also enforced opportunistically, so the 90-day promise does not
    // depend on a scheduled job being wired up correctly. The work runs after the
    // response and can never delay or fail an event write.
    await scheduleRetentionSweep(db);

    return jsonResponse(
      { ok: true },
      202,
      { "Cache-Control": "no-store" },
    );
  } catch (thrown) {
    if (thrown instanceof HttpError) return thrown.response;
    console.error("analytics_event_failed", thrown);
    return errorResponse("Failed to record analytics event", 500, "analytics_failed");
  }
}

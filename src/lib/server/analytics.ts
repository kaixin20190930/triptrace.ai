// Server-recorded analytics.
//
// Most events come from the browser, but billing outcomes only exist server-side: a
// subscription starts or ends when Stripe says so, and the user may not have a tab open.
// Those are recorded here so the billing funnel is measurable.
//
// The same privacy rules apply as for client events: allowlisted property keys only, no
// content, no identifiers beyond the account id.
import type { D1Database } from "@cloudflare/workers-types";
import {
  sanitizeAnalyticsProperties,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from "@/lib/analytics-events";
import { randomId } from "./crypto";

/** Marks a row as originating from the server rather than from a browser session. */
const SERVER_ANONYMOUS_ID = "server_system";

export async function recordServerEvent(
  db: D1Database,
  input: { eventName: AnalyticsEventName; userId: string | null; properties?: AnalyticsProperties },
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO analytics_events (
           id, event_name, anonymous_id, user_id, session_id,
           properties_json, occurred_at, received_at
         )
         VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?6)`,
      )
      .bind(
        randomId("evt_"),
        input.eventName,
        SERVER_ANONYMOUS_ID,
        input.userId,
        JSON.stringify(sanitizeAnalyticsProperties(input.eventName, input.properties ?? {})),
        now,
      )
      .run();
  } catch {
    // Analytics must never fail the operation it is describing. A missed billing event is
    // a reporting gap; a failed webhook would be a support problem.
  }
}

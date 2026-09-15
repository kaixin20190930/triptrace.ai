export const ANALYTICS_EVENT_PROPERTY_KEYS = {
  personal_cta_click: ["source"],
  personal_demo_start: ["source", "inputMode"],
  personal_text_entered: ["source", "lengthBucket"],
  personal_photo_import: ["source", "photoCount"],
  personal_photo_removed: ["source", "remainingCount", "hadUploadedCopy"],
  personal_photo_validation_failed: ["source", "reason", "photoCount"],
  personal_exif_detected: ["photoCount", "hasDate", "hasGps"],
  personal_photos_clustered: ["photoCount", "clusterCount", "datedCount", "locatedCount"],
  personal_candidate_opened: ["photoCount", "hasDate", "hasCoordinates"],
  personal_candidates_merged: ["clusterCount"],
  personal_story_generate_started: ["hasText", "photoCount", "hasDate", "hasGps"],
  personal_story_generated: ["provider", "model", "photoCount", "durationMs"],
  personal_story_generate_failed: ["reason", "photoCount", "durationMs"],
  personal_fact_confirmed: ["hasDate", "hasPlace", "hasPeople", "hasCoordinates"],
  signup_started: ["source"],
  signup_completed: ["source"],
  first_atlas_saved: ["photoCount", "hasText", "hasDate", "hasCoordinates"],
  trace_opened: ["source"],
  memory_resurfaced: ["source", "count", "reason"],
  old_trace_revisited: ["source", "reason", "yearsAgo"],
  trace_story_edited: ["source"],
  trace_facts_edited: ["source", "fieldsCount"],
  trace_deleted: ["source", "hadMedia"],
  trace_shared: ["source"],
  share_link_revoked: ["source"],
  vault_opened: ["traceCount"],
  timeline_opened: ["traceCount"],
  map_opened: ["traceCount"],
  paywall_viewed: ["source", "reason"],
  checkout_started: ["source", "planKey"],
  subscription_started: ["planKey"],
  subscription_cancelled: ["planKey"],
} as const;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENT_PROPERTY_KEYS;
export type AnalyticsPropertyValue = string | number | boolean;
export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;

export function isAnalyticsEventName(value: unknown): value is AnalyticsEventName {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(ANALYTICS_EVENT_PROPERTY_KEYS, value)
  );
}

function sanitizeValue(value: unknown): AnalyticsPropertyValue | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(-1_000_000, Math.min(1_000_000, value));
  }
  if (typeof value === "string") {
    const clean = value.trim().slice(0, 80);
    return clean || null;
  }
  return null;
}

export function sanitizeAnalyticsProperties(
  eventName: AnalyticsEventName,
  value: unknown,
): AnalyticsProperties {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const source = value as Record<string, unknown>;
  const result: AnalyticsProperties = {};
  for (const key of ANALYTICS_EVENT_PROPERTY_KEYS[eventName]) {
    const clean = sanitizeValue(source[key]);
    if (clean !== null) result[key] = clean;
  }
  return result;
}

"use client";

import {
  isAnalyticsEventName,
  sanitizeAnalyticsProperties,
  type AnalyticsEventName,
  type AnalyticsProperties,
} from "@/lib/analytics-events";

const ANONYMOUS_ID_KEY = "triptrace:analytics-anonymous-id";
const SESSION_ID_KEY = "triptrace:analytics-session-id";
const ANALYTICS_DISABLED_KEY = "triptrace:analytics-disabled";

function createClientId(prefix: "anon_" | "sess_client_") {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}${suffix}`;
}

function getOrCreateId(storage: Storage, key: string, prefix: "anon_" | "sess_client_") {
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const next = createClientId(prefix);
    storage.setItem(key, next);
    return next;
  } catch {
    return createClientId(prefix);
  }
}

export function trackEvent(eventName: AnalyticsEventName, properties: AnalyticsProperties = {}) {
  if (typeof window === "undefined" || !isAnalyticsEventName(eventName)) return;
  const privacyNavigator = window.navigator as Navigator & { globalPrivacyControl?: boolean };
  if (
    privacyNavigator.globalPrivacyControl === true ||
    privacyNavigator.doNotTrack === "1" ||
    window.localStorage.getItem(ANALYTICS_DISABLED_KEY) === "true"
  ) {
    return;
  }

  const payload = {
    eventName,
    anonymousId: getOrCreateId(window.localStorage, ANONYMOUS_ID_KEY, "anon_"),
    sessionId: getOrCreateId(window.sessionStorage, SESSION_ID_KEY, "sess_client_"),
    occurredAt: new Date().toISOString(),
    properties: sanitizeAnalyticsProperties(eventName, properties),
  };

  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify(payload),
  }).catch(() => {
    // Product actions must never fail because analytics is unavailable.
  });
}

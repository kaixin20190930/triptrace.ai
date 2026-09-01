"use client";

/**
 * Local guest device identifier.
 *
 * This exists only so the server can meter the one free anonymous AI draft. It is
 * deliberately separate from the analytics anonymous id: analytics can be switched off
 * by the visitor, while quota metering must keep working. The server hashes this value
 * and falls back to a request-IP subject when it is missing, so clearing local storage
 * does not hand out a fresh allowance on its own.
 */
const GUEST_ID_KEY = "triptrace:guest-device-id";

function createGuestId() {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  return `guest_${suffix}`;
}

export function getGuestDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(GUEST_ID_KEY);
    if (existing) return existing;
    const next = createGuestId();
    window.localStorage.setItem(GUEST_ID_KEY, next);
    return next;
  } catch {
    return createGuestId();
  }
}

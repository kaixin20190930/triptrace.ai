// Ported from triptrace.ai/functions/_lib/http.js — same wire format, TS types added.
export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export function errorResponse(message: string, status = 400, code = "bad_request") {
  return jsonResponse({ error: { code, message } }, status);
}

export async function readJson<T = unknown>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = cookieHeader.split(";").map((part) => part.trim());
  for (const cookie of cookies) {
    if (!cookie) continue;
    const [key, ...rest] = cookie.split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

type CookieOptions = {
  httpOnly?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
  maxAge?: number | null;
  secure?: boolean;
};

export function cookieHeader(name: string, value: string, options: CookieOptions = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  const merged: Required<CookieOptions> = {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: null,
    secure: false,
    ...options,
  };
  if (merged.maxAge !== null) parts.push(`Max-Age=${merged.maxAge}`);
  if (merged.path) parts.push(`Path=${merged.path}`);
  if (merged.httpOnly) parts.push("HttpOnly");
  if (merged.sameSite) parts.push(`SameSite=${merged.sameSite}`);
  if (merged.secure) parts.push("Secure");
  return parts.join("; ");
}

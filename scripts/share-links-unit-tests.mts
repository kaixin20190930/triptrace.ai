// Unit tests for the share-link primitives (M3-005, M3-006).
//
// The HTTP behaviour is covered by scripts/api-sharing-tests.mjs. This file covers the parts
// that are pure and therefore worth asserting directly: token shape, hashing, expiry logic,
// and above all the shaping of the public payload, which is what keeps owner details out of
// a shared memory.
//
// Run with: npm run test:unit

import {
  generateShareToken,
  hashShareToken,
  isActive,
  isPlausibleShareToken,
  toSharedTrace,
  tokenPrefix,
  type ResolvedShare,
} from "../src/lib/server/share-links.ts";

let failures = 0;
let total = 0;

function check(name: string, passed: boolean, detail = "") {
  total += 1;
  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

// ---------------------------------------------------------------- tokens
const token = generateShareToken();
check("a token is URL-safe", /^[A-Za-z0-9_-]+$/.test(token), token);
check("a token is long enough to be unguessable", token.length >= 20, `${token.length} chars`);
check("a token is accepted by its own validator", isPlausibleShareToken(token));
check(
  "tokens do not repeat",
  new Set(Array.from({ length: 500 }, () => generateShareToken())).size === 500,
);
check("a prefix is short and non-secret", tokenPrefix(token).length === 6 && token.startsWith(tokenPrefix(token)));

check("an empty token is rejected", !isPlausibleShareToken(""));
check("a short token is rejected", !isPlausibleShareToken("abc"));
check("a path traversal attempt is rejected", !isPlausibleShareToken("../../etc/passwd"));
check("a token with a slash is rejected", !isPlausibleShareToken("aaaaaaaaaaaaaaaaaaaa/b"));
check("a non-string is rejected", !isPlausibleShareToken(12345));
check("an overlong token is rejected", !isPlausibleShareToken("a".repeat(64)));

const hash = await hashShareToken(token);
check("a hash is 64 hex characters", /^[0-9a-f]{64}$/.test(hash), hash.slice(0, 12));
check("hashing is deterministic, which is what allows lookup", (await hashShareToken(token)) === hash);
check("a different token hashes differently", (await hashShareToken(generateShareToken())) !== hash);
check("the hash does not contain the token", !hash.includes(token));

// ---------------------------------------------------------------- activity
const now = Date.parse("2026-09-02T12:00:00.000Z");
check("a fresh link is active", isActive({ revoked_at: null, expires_at: null }, now));
check("a revoked link is not active", !isActive({ revoked_at: "2026-09-01T00:00:00.000Z", expires_at: null }, now));
check(
  "a link past its expiry is not active",
  !isActive({ revoked_at: null, expires_at: "2026-09-01T00:00:00.000Z" }, now),
);
check(
  "a link before its expiry is active",
  isActive({ revoked_at: null, expires_at: "2026-10-01T00:00:00.000Z" }, now),
);
check(
  "expiry is exclusive at the boundary, so a link does not linger",
  !isActive({ revoked_at: null, expires_at: new Date(now).toISOString() }, now),
);
check(
  "revocation wins over a future expiry",
  !isActive({ revoked_at: "2026-09-01T00:00:00.000Z", expires_at: "2027-01-01T00:00:00.000Z" }, now),
);

// ---------------------------------------------------------------- payload shaping
const resolved: ResolvedShare = {
  link: {
    id: "shr_test",
    memory_id: "mem_test",
    user_id: "usr_secret_owner",
    token_prefix: tokenPrefix(token),
    created_at: "2026-09-01T00:00:00.000Z",
    expires_at: null,
    revoked_at: null,
    view_count: 3,
    last_viewed_at: null,
  },
  row: {
    id: "mem_test",
    title: "A harbour walk",
    story: "Drafted story text.",
    place: "Porto",
    mood: "calm",
    tags_json: '["porto","dusk"]',
    photo_keys_json: '["users/usr_secret_owner/2026-05-01/img_a.jpg","users/usr_secret_owner/2026-05-01/img_b.jpg"]',
    cover_photo_key: "users/usr_secret_owner/2026-05-01/img_a.jpg",
    is_public: 0,
    created_at: "2026-05-02T00:00:00.000Z",
    event_at: "2026-05-01T00:00:00.000Z",
    date_precision: "day",
    factual_summary: "Walked the harbour wall.",
    people_json: '["My brother"]',
    latitude: 41.14961234,
    longitude: -8.61098765,
    facts_confirmed_at: "2026-05-02T00:00:00.000Z",
    ai_source: "openai",
    ai_model: "gpt-5.2",
    ai_generated_at: "2026-05-02T00:00:00.000Z",
    user_id: "usr_secret_owner",
    display_name: "Kai",
  },
};

const shared = toSharedTrace(resolved, token);
const serialised = JSON.stringify(shared);

check("the shared payload keeps the title and story", shared.title === "A harbour walk" && shared.story === "Drafted story text.");
check("the shared payload keeps confirmed facts", shared.factualSummary === "Walked the harbour wall." && shared.place === "Porto");
check("the shared payload keeps the people the owner named", shared.people.join(",") === "My brother");
check("the shared payload keeps AI provenance", shared.ai.source === "openai" && shared.ai.model === "gpt-5.2");
check("the shared payload names who shared it by display name", shared.sharedBy === "Kai");

check(
  "the shared payload never carries the owner's account id",
  !serialised.includes("usr_secret_owner"),
  "checked across the whole serialised payload",
);
check(
  "the shared payload never carries storage keys",
  !serialised.includes("users/") && !serialised.includes("img_a.jpg"),
);
check(
  "photos are addressed by position under the token",
  shared.photoUrls.length === 2 &&
    shared.photoUrls[0] === `/api/shared/${token}/media/0` &&
    shared.photoUrls[1] === `/api/shared/${token}/media/1`,
  shared.photoUrls.join(" "),
);

check(
  "coordinates are blurred to about a kilometre",
  shared.approximateLatitude === 41.15 && shared.approximateLongitude === -8.61,
  `${shared.approximateLatitude}, ${shared.approximateLongitude}`,
);
check(
  "the exact coordinates are absent, not merely unused",
  !serialised.includes("41.14961234") && !serialised.includes("-8.61098765"),
);
check("the blur radius is stated so a recipient understands the precision", shared.coordinatePrecisionKm === 1);

// The allowlist has to fail closed as the schema grows, so the exact key set is asserted.
check(
  "the payload exposes only the allowlisted fields",
  Object.keys(shared).sort().join(",") ===
    [
      "ai",
      "approximateLatitude",
      "approximateLongitude",
      "coordinatePrecisionKm",
      "datePrecision",
      "eventAt",
      "factualSummary",
      "mood",
      "people",
      "photoUrls",
      "place",
      "sharedAt",
      "sharedBy",
      "story",
      "tags",
      "title",
    ].join(","),
  Object.keys(shared).sort().join(","),
);

const noCoordinates = toSharedTrace(
  { ...resolved, row: { ...resolved.row, latitude: null, longitude: null } },
  token,
);
check(
  "a trace without coordinates shares none",
  noCoordinates.approximateLatitude === null && noCoordinates.approximateLongitude === null,
);

const noPhotos = toSharedTrace(
  { ...resolved, row: { ...resolved.row, photo_keys_json: "[]", cover_photo_key: null } },
  token,
);
check("a trace without photos shares none", noPhotos.photoUrls.length === 0);

console.log("");
console.log(`${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);

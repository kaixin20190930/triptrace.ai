// Unit tests for the media cleanup retry schedule.
//
// The scheduling decisions are pure, so they are asserted directly rather than inferred
// from queue behaviour. The database and R2 parts are covered over HTTP in
// `scripts/api-entitlement-tests.mjs`.
//
// Run with: npm run test:unit

import {
  CLEANUP_BATCH_SIZE,
  MAX_CLEANUP_ATTEMPTS,
  backoffMs,
  nextAttemptAt,
} from "../src/lib/server/media-cleanup.ts";

let failures = 0;
let total = 0;

function check(name: string, passed: boolean, detail = "") {
  total += 1;
  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

const MINUTE = 60_000;
const DAY = 86_400_000;

check("the first retry waits a minute, not immediately", backoffMs(0) === MINUTE, `${backoffMs(0)}`);
check("the delay doubles with each attempt", backoffMs(1) === 2 * MINUTE && backoffMs(2) === 4 * MINUTE);
check("the delay is capped at one day", backoffMs(50) === DAY, `${backoffMs(50)}`);
check(
  "the cap is actually reachable within the attempt limit, so it is not dead code",
  backoffMs(MAX_CLEANUP_ATTEMPTS - 1) === DAY,
  `attempt ${MAX_CLEANUP_ATTEMPTS - 1} waits ${backoffMs(MAX_CLEANUP_ATTEMPTS - 1)}ms`,
);
check(
  "the delay grows before it is capped",
  backoffMs(8) < DAY && backoffMs(8) > backoffMs(7),
  `${backoffMs(8)}`,
);
check("the schedule never decreases", 
  [0, 1, 2, 3, 4, 5, 6, 7, 8].every((attempts) => backoffMs(attempts) <= backoffMs(attempts + 1)),
);
check("a negative attempt count is treated as the first attempt", backoffMs(-5) === MINUTE);
check("a fractional attempt count is floored rather than producing a fractional delay", 
  backoffMs(2.9) === backoffMs(2),
);

const base = Date.parse("2026-09-01T00:00:00.000Z");
check(
  "the next attempt time is the backoff added to now",
  nextAttemptAt(0, base) === new Date(base + MINUTE).toISOString(),
  nextAttemptAt(0, base),
);
check(
  "a later attempt is scheduled further out",
  Date.parse(nextAttemptAt(3, base)) > Date.parse(nextAttemptAt(1, base)),
);

const totalWindowMs = (() => {
  let sum = 0;
  for (let attempt = 0; attempt < MAX_CLEANUP_ATTEMPTS; attempt += 1) sum += backoffMs(attempt);
  return sum;
})();
check(
  "a key survives a multi-day storage problem before being set aside",
  totalWindowMs >= 2 * DAY,
  `${MAX_CLEANUP_ATTEMPTS} attempts span ${(totalWindowMs / 3_600_000).toFixed(1)} hours`,
);
check("the batch size is bounded so a sweep cannot run unbounded work", CLEANUP_BATCH_SIZE <= 200);

console.log("");
console.log(`${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);

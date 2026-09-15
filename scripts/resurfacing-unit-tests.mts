// Unit tests for memory resurfacing (M3-003).
//
// Resurfacing is pure selection over traces the user already saved, so it is asserted
// directly. The properties that matter most are that it never invents a factual claim and
// that it is stable for a given day.
//
// Run with: npm run test:unit

import { resurfaceTraces, type ResurfaceableTrace } from "../src/lib/resurfacing.ts";

let failures = 0;
let total = 0;

function check(name: string, passed: boolean, detail = "") {
  total += 1;
  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

const NOW = new Date("2026-09-02T10:00:00.000Z");

function trace(
  id: string,
  eventAt: string | null,
  extra: Partial<ResurfaceableTrace> = {},
): ResurfaceableTrace {
  return {
    id,
    title: `Trace ${id}`,
    eventAt,
    datePrecision: eventAt ? "day" : "unknown",
    createdAt: eventAt ?? "2026-01-01T00:00:00.000Z",
    place: null,
    coverPhotoUrl: null,
    ...extra,
  };
}

// ---------------------------------------------------------------- empty and trivial
check("no traces resurface nothing", resurfaceTraces([], { now: NOW }).length === 0);
check(
  "a limit of zero returns nothing",
  resurfaceTraces([trace("a", "2023-09-02T00:00:00.000Z")], { now: NOW, limit: 0 }).length === 0,
);

// ---------------------------------------------------------------- on this day
const anniversary = resurfaceTraces(
  [
    trace("today-3y", "2023-09-02T09:00:00.000Z"),
    trace("unrelated", "2024-02-14T00:00:00.000Z"),
  ],
  { now: NOW },
);
check("a trace from the same day in a past year is surfaced", anniversary[0]?.trace.id === "today-3y");
check("the reason is recorded", anniversary[0]?.reason === "on_this_day", String(anniversary[0]?.reason));
check(
  "the label states how long ago, in years",
  anniversary[0]?.label === "On this day, 3 years ago",
  anniversary[0]?.label,
);
check("the year count is exposed for callers", anniversary[0]?.yearsAgo === 3);

check(
  "a single year reads naturally",
  resurfaceTraces([trace("a", "2025-09-02T00:00:00.000Z")], { now: NOW })[0]?.label ===
    "On this day, a year ago",
);

check(
  "the oldest anniversary leads",
  resurfaceTraces(
    [trace("recent", "2025-09-02T00:00:00.000Z"), trace("old", "2019-09-02T00:00:00.000Z")],
    { now: NOW },
  )[0]?.trace.id === "old",
);

// ---------------------------------------------------------------- what must not surface
check(
  "today's own trace is not called an anniversary",
  resurfaceTraces([trace("today", "2026-09-02T08:00:00.000Z")], { now: NOW }).every(
    (item) => item.reason !== "on_this_day",
  ),
);
check(
  "a future trace never surfaces as an anniversary",
  resurfaceTraces([trace("future", "2027-09-02T00:00:00.000Z")], { now: NOW }).every(
    (item) => item.reason !== "on_this_day",
  ),
);
check(
  "a trace from earlier this year is not an anniversary",
  resurfaceTraces([trace("spring", "2026-03-02T00:00:00.000Z")], { now: NOW }).every(
    (item) => item.reason !== "on_this_day",
  ),
);

// The central fact rule: no anniversary claim without a confirmed event date.
const unknownDate = resurfaceTraces(
  [
    {
      ...trace("no-date", null),
      datePrecision: "unknown",
      createdAt: "2023-09-02T00:00:00.000Z",
    },
  ],
  { now: NOW },
);
check(
  "a trace with no confirmed date is never given an anniversary from its creation date",
  unknownDate.every((item) => !["on_this_day", "same_week_years_ago", "same_month_years_ago"].includes(item.reason)),
  String(unknownDate[0]?.reason),
);
check(
  "a trace with no confirmed date can still surface for another reason",
  unknownDate.length === 1 && unknownDate[0].yearsAgo === null,
  String(unknownDate[0]?.reason),
);
check(
  "an unparseable event date is treated as no date",
  resurfaceTraces([trace("bad", "not-a-date")], { now: NOW }).every(
    (item) => item.reason !== "on_this_day",
  ),
);

// ---------------------------------------------------------------- widening windows
const sameWeek = resurfaceTraces([trace("near", "2023-08-31T00:00:00.000Z")], { now: NOW });
check(
  "a trace a couple of days off the date surfaces as the same week",
  sameWeek[0]?.reason === "same_week_years_ago" && sameWeek[0]?.label === "This week, 3 years ago",
  `${sameWeek[0]?.reason} / ${sameWeek[0]?.label}`,
);
const sameMonth = resurfaceTraces([trace("month", "2023-09-20T00:00:00.000Z")], { now: NOW });
check(
  "a trace later in the same month surfaces as the month",
  sameMonth[0]?.reason === "same_month_years_ago" && sameMonth[0]?.label === "September, 3 years ago",
  `${sameMonth[0]?.reason} / ${sameMonth[0]?.label}`,
);
// The label has to name the right year. Counting only complete years would call a
// September 2023 memory "2 years ago" in September 2026, which reads as September 2024.
check(
  "an anniversary later in the month still names the correct year",
  resurfaceTraces([trace("late", "2023-09-30T00:00:00.000Z")], { now: NOW })[0]?.yearsAgo === 3,
  String(resurfaceTraces([trace("late", "2023-09-30T00:00:00.000Z")], { now: NOW })[0]?.yearsAgo),
);
check(
  "the same holds a few days out, where the same-week rule applies",
  resurfaceTraces([trace("close", "2023-09-05T00:00:00.000Z")], { now: NOW })[0]?.label ===
    "This week, 3 years ago",
  resurfaceTraces([trace("close", "2023-09-05T00:00:00.000Z")], { now: NOW })[0]?.label,
);
check(
  "the stronger reason wins when several could apply",
  resurfaceTraces([trace("exact", "2023-09-02T00:00:00.000Z")], { now: NOW })[0]?.reason === "on_this_day",
);
check(
  "the year wrap is handled, so early January is near late December",
  resurfaceTraces([trace("newyear", "2023-12-30T00:00:00.000Z")], {
    now: new Date("2026-01-01T00:00:00.000Z"),
  })[0]?.reason === "same_week_years_ago",
);

// ---------------------------------------------------------------- places
const places = resurfaceTraces(
  [
    trace("porto-old", "2024-01-10T00:00:00.000Z", { place: "Porto" }),
    trace("lisbon-recent", "2026-08-20T00:00:00.000Z", { place: "Lisbon" }),
  ],
  { now: NOW },
);
const portoItem = places.find((item) => item.trace.id === "porto-old");
check(
  "a place not seen for a long time is offered for revisiting",
  portoItem?.reason === "revisit_place" && portoItem.label.includes("Porto"),
  `${portoItem?.reason} / ${portoItem?.label}`,
);
check(
  "a place visited recently is not called neglected",
  !places.some((item) => item.reason === "revisit_place" && item.label.includes("Lisbon")),
);
check(
  "a place is judged by its newest trace, so somewhere returned to often is not called neglected",
  !resurfaceTraces(
    [
      trace("porto-2019", "2019-01-01T00:00:00.000Z", { place: "Porto" }),
      trace("porto-now", "2026-08-25T00:00:00.000Z", { place: "Porto" }),
    ],
    { now: NOW },
  ).some((item) => item.reason === "revisit_place"),
);

// ---------------------------------------------------------------- fallbacks
const earlyDays = resurfaceTraces(
  [trace("old", "2025-04-01T00:00:00.000Z"), trace("newer", "2026-08-30T00:00:00.000Z")],
  { now: NOW },
);
check(
  "an Atlas with no anniversary still surfaces something from early on",
  earlyDays.some((item) => item.reason === "early_days" && item.trace.id === "old"),
  earlyDays.map((item) => item.reason).join(","),
);
check(
  "a recent trace is never described as being from the early days",
  !resurfaceTraces([trace("fresh", "2026-08-30T00:00:00.000Z")], { now: NOW }).some(
    (item) => item.reason === "early_days",
  ),
);
const onlyRecent = resurfaceTraces([trace("fresh", "2026-08-30T00:00:00.000Z")], { now: NOW });
check(
  "a brand new Atlas still surfaces its first trace rather than nothing",
  onlyRecent.length === 1 && onlyRecent[0].reason === "first_trace",
  String(onlyRecent[0]?.reason),
);
check(
  "the last-resort reason never claims a timespan",
  onlyRecent[0]?.yearsAgo === null && onlyRecent[0]?.label === "Where your Atlas began",
);

// ---------------------------------------------------------------- shape and stability
const many = [
  trace("a", "2019-09-02T00:00:00.000Z"),
  trace("b", "2020-09-02T00:00:00.000Z"),
  trace("c", "2021-09-02T00:00:00.000Z"),
  trace("d", "2022-09-02T00:00:00.000Z"),
];
check("the result respects the limit", resurfaceTraces(many, { now: NOW, limit: 2 }).length === 2);
check(
  "a trace is never surfaced twice",
  (() => {
    const ids = resurfaceTraces(many, { now: NOW, limit: 4 }).map((item) => item.trace.id);
    return new Set(ids).size === ids.length;
  })(),
);
check(
  "the same day and the same traces give the same result, so it does not churn on reload",
  JSON.stringify(resurfaceTraces(many, { now: NOW })) ===
    JSON.stringify(resurfaceTraces(many, { now: new Date("2026-09-02T23:00:00.000Z") })),
);
check(
  "a different day can give a different result",
  JSON.stringify(resurfaceTraces(many, { now: NOW })) !==
    JSON.stringify(resurfaceTraces(many, { now: new Date("2026-11-15T10:00:00.000Z") })),
);
check(
  "input order does not change the outcome",
  JSON.stringify(resurfaceTraces(many, { now: NOW }).map((i) => i.trace.id)) ===
    JSON.stringify(resurfaceTraces([...many].reverse(), { now: NOW }).map((i) => i.trace.id)),
);
check(
  "resurfacing does not modify the traces it is given",
  (() => {
    const input = [trace("a", "2019-09-02T00:00:00.000Z")];
    const snapshot = JSON.stringify(input);
    resurfaceTraces(input, { now: NOW });
    return JSON.stringify(input) === snapshot;
  })(),
  "no new content is created",
);
check(
  "a trace with no id is skipped rather than surfaced without a target",
  resurfaceTraces([trace("", "2019-09-02T00:00:00.000Z")], { now: NOW }).length === 0,
);
check(
  "every surfaced item carries a non-empty label",
  resurfaceTraces(many, { now: NOW, limit: 4 }).every((item) => item.label.length > 5),
);

console.log("");
console.log(`${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);

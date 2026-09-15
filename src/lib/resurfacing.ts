/**
 * Memory resurfacing (M3-003).
 *
 * The acceptance criterion is precise: existing traces are surfaced *without creating new
 * content*. So this module only ever selects and labels what the user already saved. It
 * calls no model, writes nothing, and costs nothing to run.
 *
 * Two rules shape it:
 *
 *  1. Anniversary reasons require a confirmed event date. Saying "three years ago today"
 *     based on when someone typed the memory rather than when it happened would be a
 *     factual claim the data does not support, which is exactly what the fact contract
 *     forbids. Traces with an unknown date can still surface, just never by anniversary.
 *  2. The result is stable for a given day. It changes as the date changes, not on every
 *     reload, because a memory that appears and vanishes on refresh feels broken rather
 *     than serendipitous.
 *
 * Rules are tried from most to least meaningful and the list degrades gracefully, which
 * matters because a new Atlas with three traces would return nothing from the strong rules.
 */

export type ResurfaceableTrace = {
  /** Optional because an unsaved draft has no id yet. Such traces are skipped. */
  id?: string;
  title: string;
  /** Confirmed date of the event itself, not when the trace was written. */
  eventAt?: string | null;
  datePrecision?: string;
  createdAt?: string | null;
  place?: string | null;
  coverPhotoUrl?: string | null;
};

export type ResurfaceReason =
  | "on_this_day"
  | "same_week_years_ago"
  | "same_month_years_ago"
  | "revisit_place"
  | "early_days"
  | "first_trace";

export type ResurfacedTrace<T extends ResurfaceableTrace = ResurfaceableTrace> = {
  trace: T;
  reason: ResurfaceReason;
  /** Whole years between the event and today, when the reason is an anniversary. */
  yearsAgo: number | null;
  /** Copy shown to the user. Never claims more than the data supports. */
  label: string;
};

const DAY_MS = 86_400_000;
/** Half-width of the "same week" window, in days. */
const WEEK_WINDOW_DAYS = 3;
/** A place counts as worth revisiting once its newest trace is older than this. */
const PLACE_REVISIT_DAYS = 180;
/** Minimum age for the early-days rule, so a recent trace is never called old. */
const EARLY_DAYS_MIN_AGE_DAYS = 90;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Anniversaries need a real event date, so an unknown precision disqualifies a trace. */
function eventDate(trace: ResurfaceableTrace): Date | null {
  if (trace.datePrecision === "unknown") return null;
  return parseDate(trace.eventAt);
}

/**
 * Calendar-year difference, which is the correct measure for an anniversary label.
 *
 * Whole elapsed years would be wrong here. An event on 20 September 2023 seen on 2 September
 * 2026 has only two complete years behind it, but "September, 2 years ago" reads as
 * September 2024 and points at the wrong year. What the label needs is the distance between
 * the calendar years, so a September memory from 2023 is always "3 years ago" in 2026.
 *
 * For the same-day rule the two measures coincide, so nothing is lost.
 */
function calendarYearsAgo(event: Date, now: Date): number {
  return now.getUTCFullYear() - event.getUTCFullYear();
}

/** Distance in days between two dates ignoring the year, handling the year wrap. */
function dayOfYearDistance(event: Date, now: Date): number {
  const reference = Date.UTC(2000, now.getUTCMonth(), now.getUTCDate());
  const candidate = Date.UTC(2000, event.getUTCMonth(), event.getUTCDate());
  const direct = Math.abs(reference - candidate) / DAY_MS;
  return Math.min(direct, 366 - direct);
}

function ageInDays(value: Date, now: Date): number {
  return Math.floor((now.getTime() - value.getTime()) / DAY_MS);
}

function yearsLabel(years: number): string {
  if (years <= 0) return "earlier this year";
  if (years === 1) return "a year ago";
  return `${years} years ago`;
}

export function describeResurfaceReason(item: ResurfacedTrace): string {
  return item.label;
}

/**
 * Picks traces worth showing again.
 *
 * `limit` caps the result. Ordering is by rule strength, then by how long ago the memory
 * happened, so the oldest anniversary leads.
 */
export function resurfaceTraces<T extends ResurfaceableTrace>(
  traces: T[],
  options: { now?: Date; limit?: number } = {},
): ResurfacedTrace<T>[] {
  const now = options.now ?? new Date();
  const limit = Math.max(0, options.limit ?? 3);
  if (limit === 0 || traces.length === 0) return [];

  const picked = new Map<string, ResurfacedTrace<T>>();

  const take = (trace: T, reason: ResurfaceReason, yearsAgo: number | null, label: string) => {
    if (!trace.id || picked.has(trace.id)) return;
    picked.set(trace.id, { trace, reason, yearsAgo, label });
  };

  // Anniversary rules, widening the window each time.
  const dated = traces
    .map((trace) => ({ trace, event: eventDate(trace) }))
    .filter((entry): entry is { trace: T; event: Date } => entry.event !== null)
    .map((entry) => ({
      ...entry,
      years: calendarYearsAgo(entry.event, now),
      distance: dayOfYearDistance(entry.event, now),
    }))
    // Only earlier calendar years, which excludes this year's traces and any future date.
    .filter((entry) => entry.years >= 1)
    .sort((a, b) => b.years - a.years);

  for (const entry of dated) {
    if (entry.distance === 0) {
      take(entry.trace, "on_this_day", entry.years, `On this day, ${yearsLabel(entry.years)}`);
    }
  }
  for (const entry of dated) {
    if (entry.distance > 0 && entry.distance <= WEEK_WINDOW_DAYS) {
      take(entry.trace, "same_week_years_ago", entry.years, `This week, ${yearsLabel(entry.years)}`);
    }
  }
  for (const entry of dated) {
    if (entry.distance > WEEK_WINDOW_DAYS && entry.event.getUTCMonth() === now.getUTCMonth()) {
      const month = entry.event.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
      take(entry.trace, "same_month_years_ago", entry.years, `${month}, ${yearsLabel(entry.years)}`);
    }
  }

  // A place not visited in a long time. Uses the newest trace at that place, so somewhere
  // the user returns to often is not called neglected.
  if (picked.size < limit) {
    const byPlace = new Map<string, { trace: T; when: Date }>();
    for (const trace of traces) {
      const place = trace.place?.trim();
      if (!place) continue;
      const when = eventDate(trace) ?? parseDate(trace.createdAt);
      if (!when) continue;
      const existing = byPlace.get(place);
      if (!existing || when.getTime() > existing.when.getTime()) byPlace.set(place, { trace, when });
    }
    const stalePlaces = Array.from(byPlace.entries())
      .filter(([, value]) => ageInDays(value.when, now) >= PLACE_REVISIT_DAYS)
      .sort((a, b) => a[1].when.getTime() - b[1].when.getTime());
    for (const [place, value] of stalePlaces) {
      if (picked.size >= limit) break;
      take(value.trace, "revisit_place", null, `You have not looked back at ${place} in a while`);
    }
  }

  // Something from early on, so an Atlas without anniversaries still resurfaces something.
  if (picked.size < limit) {
    const oldest = traces
      .map((trace) => ({ trace, when: eventDate(trace) ?? parseDate(trace.createdAt) }))
      .filter((entry): entry is { trace: T; when: Date } => entry.when !== null)
      .filter((entry) => ageInDays(entry.when, now) >= EARLY_DAYS_MIN_AGE_DAYS)
      .sort((a, b) => a.when.getTime() - b.when.getTime());
    for (const entry of oldest) {
      if (picked.size >= limit) break;
      take(entry.trace, "early_days", null, "From the early days of your Atlas");
    }
  }

  // Last resort: the first trace ever saved, which is the one moment every Atlas has.
  if (picked.size === 0) {
    const first = traces
      .map((trace) => ({ trace, when: parseDate(trace.createdAt) }))
      .filter((entry): entry is { trace: T; when: Date } => entry.when !== null)
      .sort((a, b) => a.when.getTime() - b.when.getTime())[0];
    if (first) take(first.trace, "first_trace", null, "Where your Atlas began");
  }

  return Array.from(picked.values()).slice(0, limit);
}

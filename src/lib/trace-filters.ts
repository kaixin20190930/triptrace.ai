/**
 * Search and faceted filtering over saved traces (M3-001, M3-002).
 *
 * Pure on purpose: the whole Atlas is already loaded client-side, so filtering needs no
 * request, and keeping it free of React makes every rule directly testable.
 *
 * One rule carries over from the fact contract: a trace whose date was never confirmed has
 * no year. It is not filed under the year it was typed in, because that would assign it a
 * date the user never confirmed. Such traces are reachable through an explicit
 * "Date not set" option instead of being quietly misfiled.
 */

export type FilterableTrace = {
  id?: string;
  title: string;
  story: string;
  tags: string[];
  place?: string | null;
  people?: string[];
  factualSummary?: string;
  eventAt?: string | null;
  datePrecision?: string;
  createdAt?: string | null;
  photoUrls?: string[];
};

/** What a trace contains. The schema has no event-type taxonomy yet, so this stands in. */
export type ContentFilter = "all" | "photos" | "places";

/** Sentinel for traces with no confirmed date, kept distinct from "no year filter". */
export const NO_YEAR = "unknown";

export type TraceFilterState = {
  query: string;
  content: ContentFilter;
  /** A four-digit year, `NO_YEAR`, or null for no year filter. */
  year: string | null;
  place: string | null;
  person: string | null;
};

export const EMPTY_FILTERS: TraceFilterState = {
  query: "",
  content: "all",
  year: null,
  place: null,
  person: null,
};

export function hasActiveFilters(filters: TraceFilterState): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.content !== "all" ||
    filters.year !== null ||
    filters.place !== null ||
    filters.person !== null
  );
}

/** Confirmed year of the event, or null when the date was never confirmed. */
export function traceYear(trace: FilterableTrace): string | null {
  if (trace.datePrecision === "unknown") return null;
  if (!trace.eventAt) return null;
  const date = new Date(trace.eventAt);
  return Number.isNaN(date.getTime()) ? null : String(date.getUTCFullYear());
}

function matchesContent(trace: FilterableTrace, content: ContentFilter): boolean {
  if (content === "photos") return (trace.photoUrls?.length ?? 0) > 0;
  if (content === "places") return Boolean(trace.place?.trim());
  return true;
}

function matchesYear(trace: FilterableTrace, year: string | null): boolean {
  if (year === null) return true;
  const actual = traceYear(trace);
  return year === NO_YEAR ? actual === null : actual === year;
}

function matchesPlace(trace: FilterableTrace, place: string | null): boolean {
  if (place === null) return true;
  return (trace.place?.trim() || "") === place;
}

function matchesPerson(trace: FilterableTrace, person: string | null): boolean {
  if (person === null) return true;
  return (trace.people ?? []).some((name) => name.trim() === person);
}

/**
 * Free-text match.
 *
 * Covers every field a person might remember a memory by, including the people named and
 * the factual note, and treats a four-digit number as a year so typing "2023" finds that
 * year's traces.
 */
function matchesQuery(trace: FilterableTrace, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    trace.title,
    trace.story,
    trace.factualSummary ?? "",
    trace.place ?? "",
    ...(trace.tags ?? []),
    ...(trace.people ?? []),
  ]
    .join("\n")
    .toLowerCase();
  if (haystack.includes(q)) return true;

  if (/^\d{4}$/.test(q)) return traceYear(trace) === q;
  return false;
}

/** Applies every dimension. Dimensions combine with AND. */
export function filterTraces<T extends FilterableTrace>(traces: T[], filters: TraceFilterState): T[] {
  return traces.filter(
    (trace) =>
      matchesContent(trace, filters.content) &&
      matchesYear(trace, filters.year) &&
      matchesPlace(trace, filters.place) &&
      matchesPerson(trace, filters.person) &&
      matchesQuery(trace, filters.query),
  );
}

export type FacetOption = {
  value: string;
  label: string;
  count: number;
};

export type TraceFacets = {
  years: FacetOption[];
  places: FacetOption[];
  people: FacetOption[];
};

/**
 * Options for each facet, with counts.
 *
 * A facet's counts are computed with every *other* filter applied but not its own. Counting
 * with its own filter applied would collapse each list to the single chosen value and trap
 * the user, unable to switch year without first clearing it.
 */
export function buildFacets<T extends FilterableTrace>(
  traces: T[],
  filters: TraceFilterState,
): TraceFacets {
  const withoutYear = filterTraces(traces, { ...filters, year: null });
  const withoutPlace = filterTraces(traces, { ...filters, place: null });
  const withoutPerson = filterTraces(traces, { ...filters, person: null });

  const yearCounts = new Map<string, number>();
  for (const trace of withoutYear) {
    const key = traceYear(trace) ?? NO_YEAR;
    yearCounts.set(key, (yearCounts.get(key) ?? 0) + 1);
  }

  const placeCounts = new Map<string, number>();
  for (const trace of withoutPlace) {
    const place = trace.place?.trim();
    if (!place) continue;
    placeCounts.set(place, (placeCounts.get(place) ?? 0) + 1);
  }

  const personCounts = new Map<string, number>();
  for (const trace of withoutPerson) {
    for (const raw of trace.people ?? []) {
      const person = raw.trim();
      if (!person) continue;
      personCounts.set(person, (personCounts.get(person) ?? 0) + 1);
    }
  }

  return {
    // Newest year first, with the undated group last so it never leads the list.
    years: Array.from(yearCounts.entries())
      .sort((a, b) => {
        if (a[0] === NO_YEAR) return 1;
        if (b[0] === NO_YEAR) return -1;
        return Number(b[0]) - Number(a[0]);
      })
      .map(([value, count]) => ({
        value,
        label: value === NO_YEAR ? "Date not set" : value,
        count,
      })),
    // Most frequent first, then alphabetically so the order is stable.
    places: sortByCountThenName(placeCounts),
    people: sortByCountThenName(personCounts),
  };
}

function sortByCountThenName(counts: Map<string, number>): FacetOption[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, label: value, count }));
}

/** Human summary of what is currently applied, for an accessible status line. */
export function describeFilters(filters: TraceFilterState, resultCount: number, total: number): string {
  if (!hasActiveFilters(filters)) {
    return `${total} ${total === 1 ? "trace" : "traces"}`;
  }
  const parts: string[] = [];
  if (filters.query.trim()) parts.push(`matching "${filters.query.trim()}"`);
  if (filters.content === "photos") parts.push("with photos");
  if (filters.content === "places") parts.push("with a place");
  if (filters.year) parts.push(filters.year === NO_YEAR ? "with no confirmed date" : `from ${filters.year}`);
  if (filters.place) parts.push(`in ${filters.place}`);
  if (filters.person) parts.push(`with ${filters.person}`);
  return `${resultCount} of ${total} ${total === 1 ? "trace" : "traces"} ${parts.join(", ")}`;
}

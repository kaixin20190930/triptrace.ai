// Unit tests for Atlas search and faceted filtering (M3-001, M3-002).
//
// Run with: npm run test:unit

import {
  EMPTY_FILTERS,
  NO_YEAR,
  buildFacets,
  describeFilters,
  filterTraces,
  hasActiveFilters,
  traceYear,
  type FilterableTrace,
  type TraceFilterState,
} from "../src/lib/trace-filters.ts";

let failures = 0;
let total = 0;

function check(name: string, passed: boolean, detail = "") {
  total += 1;
  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

function trace(id: string, overrides: Partial<FilterableTrace> = {}): FilterableTrace {
  return {
    id,
    title: `Trace ${id}`,
    story: "A story body.",
    tags: [],
    place: null,
    people: [],
    factualSummary: "",
    eventAt: null,
    datePrecision: "unknown",
    createdAt: "2026-01-01T00:00:00.000Z",
    photoUrls: [],
    ...overrides,
  };
}

const porto2023 = trace("porto2023", {
  title: "Harbour wall at dusk",
  story: "We walked along the water.",
  tags: ["dusk", "walk"],
  place: "Porto",
  people: ["My brother"],
  factualSummary: "Walked the harbour wall.",
  eventAt: "2023-09-02T00:00:00.000Z",
  datePrecision: "day",
  photoUrls: ["/api/media?key=a"],
});
const lisbon2024 = trace("lisbon2024", {
  title: "Tram window",
  story: "Yellow paint and steep streets.",
  tags: ["tram"],
  place: "Lisbon",
  people: ["Ana", "My brother"],
  eventAt: "2024-05-11T00:00:00.000Z",
  datePrecision: "day",
  photoUrls: ["/api/media?key=b"],
});
const porto2024 = trace("porto2024", {
  title: "Second visit",
  story: "Back again in spring.",
  tags: [],
  place: "Porto",
  people: ["Ana"],
  eventAt: "2024-03-04T00:00:00.000Z",
  datePrecision: "day",
});
const undated = trace("undated", {
  title: "A photo with no date",
  story: "No metadata at all.",
  place: "Porto",
  people: [],
  photoUrls: ["/api/media?key=c"],
});

const all = [porto2023, lisbon2024, porto2024, undated];

function filters(overrides: Partial<TraceFilterState> = {}): TraceFilterState {
  return { ...EMPTY_FILTERS, ...overrides };
}

const ids = (list: FilterableTrace[]) => list.map((t) => t.id).sort().join(",");

// ---------------------------------------------------------------- year derivation
check("a confirmed date yields its year", traceYear(porto2023) === "2023", String(traceYear(porto2023)));
check("an unconfirmed date yields no year", traceYear(undated) === null);
check(
  "a trace is never filed under the year it was typed in",
  traceYear({ ...undated, createdAt: "2026-01-01T00:00:00.000Z" }) === null,
  "creation date must not become an event year",
);
check(
  "an unparseable date yields no year",
  traceYear({ ...porto2023, eventAt: "not-a-date" }) === null,
);
check(
  "an explicitly unknown precision overrides a stored date",
  traceYear({ ...porto2023, datePrecision: "unknown" }) === null,
);

// ---------------------------------------------------------------- no filters
check("no filters returns everything", filterTraces(all, filters()).length === 4);
check("no filters is reported as inactive", !hasActiveFilters(filters()));
check("a whitespace-only query counts as inactive", !hasActiveFilters(filters({ query: "   " })));
check("any dimension counts as active", hasActiveFilters(filters({ person: "Ana" })));

// ---------------------------------------------------------------- search
check(
  "search matches the title",
  ids(filterTraces(all, filters({ query: "harbour" }))) === "porto2023",
);
check(
  "search matches the story",
  ids(filterTraces(all, filters({ query: "steep streets" }))) === "lisbon2024",
);
check("search matches a tag", ids(filterTraces(all, filters({ query: "tram" }))) === "lisbon2024");
check("search matches a place", ids(filterTraces(all, filters({ query: "lisbon" }))) === "lisbon2024");
check(
  "search matches a person, which the old search missed",
  ids(filterTraces(all, filters({ query: "ana" }))) === "lisbon2024,porto2024",
  ids(filterTraces(all, filters({ query: "ana" }))),
);
check(
  "search matches the factual note, which the old search missed",
  ids(filterTraces(all, filters({ query: "walked the harbour" }))) === "porto2023",
);
check(
  "a four-digit query is treated as a year, which the old search missed",
  ids(filterTraces(all, filters({ query: "2024" }))) === "lisbon2024,porto2024",
  ids(filterTraces(all, filters({ query: "2024" }))),
);
check(
  "a year query does not match an undated trace",
  !filterTraces(all, filters({ query: "2023" })).includes(undated),
);
check("search is case-insensitive", ids(filterTraces(all, filters({ query: "PORTO" }))).length > 0);
check("search trims surrounding space", ids(filterTraces(all, filters({ query: "  tram  " }))) === "lisbon2024");
check("a query with no match returns nothing", filterTraces(all, filters({ query: "zzz" })).length === 0);

// ---------------------------------------------------------------- single dimensions
check("the photos filter keeps only traces with photos", ids(filterTraces(all, filters({ content: "photos" }))) === "lisbon2024,porto2023,undated");
// Every fixture above has a place, so the filter is also checked against one that does not.
check(
  "the places filter keeps traces that have a place",
  ids(filterTraces(all, filters({ content: "places" }))) === "lisbon2024,porto2023,porto2024,undated",
  ids(filterTraces(all, filters({ content: "places" }))),
);
check(
  "the places filter drops a trace with no place",
  ids(filterTraces([...all, trace("placeless", { place: null })], filters({ content: "places" }))) ===
    "lisbon2024,porto2023,porto2024,undated",
);
check(
  "a place that is only whitespace does not count as having a place",
  filterTraces([trace("blank", { place: "   " })], filters({ content: "places" })).length === 0,
);
check("a year filter selects that year", ids(filterTraces(all, filters({ year: "2024" }))) === "lisbon2024,porto2024");
check(
  "the undated option is distinct from having no year filter",
  ids(filterTraces(all, filters({ year: NO_YEAR }))) === "undated",
);
check("a place filter is exact, not a substring", ids(filterTraces(all, filters({ place: "Porto" }))) === "porto2023,porto2024,undated");
check(
  "a place filter does not match a different place with a shared prefix",
  filterTraces([trace("p", { place: "Port" }), trace("q", { place: "Porto" })], filters({ place: "Porto" })).length === 1,
);
check("a person filter matches anyone named on the trace", ids(filterTraces(all, filters({ person: "My brother" }))) === "lisbon2024,porto2023");

// ---------------------------------------------------------------- combinations
check(
  "year and place combine with AND",
  ids(filterTraces(all, filters({ year: "2024", place: "Porto" }))) === "porto2024",
);
check(
  "person and place combine with AND",
  ids(filterTraces(all, filters({ person: "Ana", place: "Porto" }))) === "porto2024",
);
check(
  "all four dimensions combine",
  ids(
    filterTraces(all, filters({ query: "dusk", content: "photos", year: "2023", place: "Porto", person: "My brother" })),
  ) === "porto2023",
);
check(
  "a contradictory combination returns nothing rather than ignoring a filter",
  filterTraces(all, filters({ year: "2023", place: "Lisbon" })).length === 0,
);
check(
  "content and year combine",
  ids(filterTraces(all, filters({ content: "photos", year: NO_YEAR }))) === "undated",
);

// ---------------------------------------------------------------- facets
const facets = buildFacets(all, filters());
check(
  "years are listed newest first with the undated group last",
  facets.years.map((option) => option.value).join(",") === `2024,2023,${NO_YEAR}`,
  facets.years.map((o) => o.value).join(","),
);
check(
  "year counts are correct",
  facets.years.find((o) => o.value === "2024")?.count === 2 &&
    facets.years.find((o) => o.value === NO_YEAR)?.count === 1,
);
check("the undated group is labelled in plain language", facets.years.find((o) => o.value === NO_YEAR)?.label === "Date not set");
check(
  "places are listed by frequency",
  facets.places.map((option) => `${option.value}:${option.count}`).join(",") === "Porto:3,Lisbon:1",
  facets.places.map((o) => `${o.value}:${o.count}`).join(","),
);
check(
  "people are listed by frequency then alphabetically",
  facets.people.map((option) => `${option.value}:${option.count}`).join(",") === "Ana:2,My brother:2",
  facets.people.map((o) => `${o.value}:${o.count}`).join(","),
);
check("a trace with no place contributes no place option", !facets.places.some((o) => o.value === ""));

// The key faceting property: choosing a year must not collapse the year list.
const yearChosen = buildFacets(all, filters({ year: "2024" }));
check(
  "choosing a year leaves the other years selectable, so the user is not trapped",
  yearChosen.years.map((o) => o.value).join(",") === `2024,2023,${NO_YEAR}`,
  yearChosen.years.map((o) => o.value).join(","),
);
check(
  "choosing a year does narrow the place counts",
  yearChosen.places.map((o) => `${o.value}:${o.count}`).join(",") === "Lisbon:1,Porto:1",
  yearChosen.places.map((o) => `${o.value}:${o.count}`).join(","),
);
const placeChosen = buildFacets(all, filters({ place: "Lisbon" }));
check(
  "choosing a place leaves the other places selectable",
  placeChosen.places.map((o) => o.value).join(",") === "Porto,Lisbon",
  placeChosen.places.map((o) => o.value).join(","),
);
check(
  "choosing a place narrows the year counts",
  placeChosen.years.map((o) => `${o.value}:${o.count}`).join(",") === "2024:1",
  placeChosen.years.map((o) => `${o.value}:${o.count}`).join(","),
);
check("no traces produce no facet options", buildFacets([], filters()).years.length === 0);

// ---------------------------------------------------------------- summary line
check(
  "with no filters the summary is a plain count",
  describeFilters(filters(), 4, 4) === "4 traces",
  describeFilters(filters(), 4, 4),
);
check(
  "one trace is described in the singular",
  describeFilters(filters(), 1, 1) === "1 trace",
);
check(
  "the summary names every active filter",
  describeFilters(filters({ query: "dusk", year: "2023", place: "Porto", person: "Ana" }), 1, 4) ===
    '1 of 4 traces matching "dusk", from 2023, in Porto, with Ana',
  describeFilters(filters({ query: "dusk", year: "2023", place: "Porto", person: "Ana" }), 1, 4),
);
check(
  "the undated filter is described honestly",
  describeFilters(filters({ year: NO_YEAR }), 1, 4).includes("no confirmed date"),
  describeFilters(filters({ year: NO_YEAR }), 1, 4),
);

// ---------------------------------------------------------------- purity
check(
  "filtering does not modify its input",
  (() => {
    const snapshot = JSON.stringify(all);
    filterTraces(all, filters({ query: "porto", year: "2023" }));
    buildFacets(all, filters({ place: "Porto" }));
    return JSON.stringify(all) === snapshot;
  })(),
);

console.log("");
console.log(`${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);

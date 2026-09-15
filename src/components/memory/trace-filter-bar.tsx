"use client";

/**
 * Year, place, and person filters alongside the content filter (M3-002).
 *
 * Native selects rather than a custom menu: they are keyboard and screen-reader accessible
 * for free, they work on mobile without any extra handling, and a filter control is not
 * where bespoke widgets earn their cost.
 */

import * as React from "react";
import { X } from "lucide-react";
import {
  NO_YEAR,
  hasActiveFilters,
  type TraceFacets,
  type TraceFilterState,
} from "@/lib/trace-filters";

function FacetSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  options: { value: string; label: string; count: number }[];
  onChange: (next: string | null) => void;
}) {
  if (options.length === 0) return null;
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className="rounded-full border border-border bg-background px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} ({option.count})
          </option>
        ))}
      </select>
    </label>
  );
}

export function TraceFilterBar({
  filters,
  facets,
  summary,
  onChange,
  onClear,
}: {
  filters: TraceFilterState;
  facets: TraceFacets;
  summary: string;
  onChange: (patch: Partial<TraceFilterState>) => void;
  onClear: () => void;
}) {
  const active = hasActiveFilters(filters);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <FacetSelect
          id="filter-year"
          label="Year"
          value={filters.year}
          options={facets.years}
          onChange={(year) => onChange({ year })}
        />
        <FacetSelect
          id="filter-place"
          label="Place"
          value={filters.place}
          options={facets.places}
          onChange={(place) => onChange({ place })}
        />
        <FacetSelect
          id="filter-person"
          label="Person"
          value={filters.person}
          options={facets.people}
          onChange={(person) => onChange({ person })}
        />
        {active && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-accent/20"
          >
            <X className="h-3 w-3" aria-hidden />
            Clear filters
          </button>
        )}
      </div>

      {/* Announced politely so a screen reader hears the result count change. */}
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {summary}
        {filters.year === NO_YEAR && (
          <span className="mt-1 block">
            These traces have no confirmed date, so they are not filed under any year.
          </span>
        )}
      </p>
    </div>
  );
}

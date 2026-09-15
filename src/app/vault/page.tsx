"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import Link from "next/link";
import { CalendarDays, Images, MapPin, Search, Sparkles } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { useMemories, type Memory } from "@/lib/use-memories";
import { useSelectedTrace } from "@/lib/use-selected-trace";
import { MemoryDetail } from "@/components/memory/memory-detail";
import { ResurfacedRail } from "@/components/memory/resurfaced-rail";
import { TraceFilterBar } from "@/components/memory/trace-filter-bar";
import {
  EMPTY_FILTERS,
  buildFacets,
  describeFilters,
  filterTraces,
  type TraceFilterState,
} from "@/lib/trace-filters";
import { TracePreviewCard } from "@/components/memory/trace-preview-card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type VaultFilter = "all" | "photos" | "places";

function getDisplayDate(memory: Memory) {
  return memory.eventAt || memory.createdAt || null;
}

function formatDate(value: string | null, options: Intl.DateTimeFormatOptions) {
  return value ? new Date(value).toLocaleDateString("en-US", options) : "Date not set";
}

function MemoryCard({
  memory,
  onClick,
}: {
  memory: Memory;
  onClick: () => void;
}) {
  const displayDate = getDisplayDate(memory);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[18rem] flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {memory.coverPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={memory.coverPhotoUrl}
          alt=""
          className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-accent/20 text-3xl">
          📖
        </div>
      )}
      <div className="flex flex-col gap-2 p-4">
        <p className="line-clamp-2 font-serif text-sm font-semibold leading-snug">
          {memory.title}
        </p>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" aria-hidden />
            {formatDate(displayDate, { month: "short", day: "numeric" })}
          </span>
          {memory.place && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden />
              {memory.place}
            </span>
          )}
        </div>
        {memory.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {memory.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="rounded-full bg-accent/30 px-2 py-0.5 text-[10px] font-medium">
                #{tag}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[10px] text-muted-foreground/60">
            {memory.people?.length ? `${memory.people.length} people noted` : "Private trace"}
          </span>
          <span className="text-[10px] font-medium text-primary">Open detail</span>
        </div>
      </div>
    </button>
  );
}

function FeaturedStrip({
  memories,
  onSelect,
}: {
  memories: Memory[];
  onSelect: (memory: Memory) => void;
}) {
  const featured = memories.filter((memory) => memory.coverPhotoUrl).slice(0, 5);
  if (featured.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Photo Shelf</p>
          <h2 className="font-serif text-2xl font-semibold">Recent images with stories</h2>
        </div>
        <Images className="h-5 w-5 text-primary" aria-hidden />
      </div>
      <div className="grid auto-rows-[9rem] grid-cols-2 gap-2 p-2 md:grid-cols-5 md:auto-rows-[11rem]">
        {featured.map((memory, index) => (
          <button
            key={memory.id ?? `${memory.title}-${index}`}
            type="button"
            onClick={() => onSelect(memory)}
            className={`group relative overflow-hidden rounded-xl bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              index === 0 ? "md:col-span-2 md:row-span-2" : ""
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={memory.coverPhotoUrl || ""}
              alt=""
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-xs font-medium text-white">
              <span className="line-clamp-2">{memory.title}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <Skeleton className="aspect-[4/3] w-full" />
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export default function VaultPage() {
  const { memories, loading } = useMemories();
  const openedTrackedRef = React.useRef(false);
  const [filters, setFilters] = useState<TraceFilterState>(EMPTY_FILTERS);
  const [detailOpen, setDetailOpen] = useState(false);
  const searchTrackedRef = React.useRef("");

  // Derived so the rest of the component keeps reading `query` and `filter` as before.
  const query = filters.query;
  const filter = filters.content;

  const patchFilters = React.useCallback((patch: Partial<TraceFilterState>) => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);
  const { selected, selectTrace } = useSelectedTrace(memories);

  React.useEffect(() => {
    if (loading || openedTrackedRef.current) return;
    openedTrackedRef.current = true;
    trackEvent("vault_opened", { traceCount: memories.length });
  }, [loading, memories.length]);

  // Search and filtering live in `src/lib/trace-filters.ts` so every rule is unit tested.
  const filtered = useMemo(() => filterTraces(memories, filters), [memories, filters]);
  const facets = useMemo(() => buildFacets(memories, filters), [memories, filters]);
  const filterSummary = useMemo(
    () => describeFilters(filters, filtered.length, memories.length),
    [filters, filtered.length, memories.length],
  );

  const stats = useMemo(
    () => ({
      total: memories.length,
      withPhotos: memories.filter((m) => m.photoUrls.length > 0).length,
      withPlaces: memories.filter((m) => Boolean(m.place)).length,
    }),
    [memories],
  );

  const filterOptions: { value: VaultFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { value: "all", label: "All", icon: Sparkles },
    { value: "photos", label: "Photos", icon: Images },
    { value: "places", label: "Places", icon: MapPin },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <section className="border-b border-border pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">My Atlas</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold">Your private memory library</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Browse saved traces as a living album: images, places, dates, people, and the story behind each moment.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border bg-background px-3 py-1">Total {stats.total}</span>
            <span className="rounded-full border border-border bg-background px-3 py-1">With photos {stats.withPhotos}</span>
            <span className="rounded-full border border-border bg-background px-3 py-1">With places {stats.withPlaces}</span>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              className="pl-9"
              placeholder="Search stories, tags, places, people, or a year..."
              value={query}
              aria-label="Search your traces"
              onChange={(e) => {
                const next = e.target.value;
                patchFilters({ query: next });
                // One event per distinct non-empty search, so a metric is not sent per keystroke.
                const trimmed = next.trim();
                if (trimmed.length >= 2 && searchTrackedRef.current !== trimmed) {
                  searchTrackedRef.current = trimmed;
                  trackEvent("personal_search_used", { source: "vault", lengthBucket: trimmed.length < 12 ? "short" : "long" });
                }
              }}
            />
          </div>
          <div className="flex rounded-full border border-border bg-card p-1">
            {filterOptions.map((option) => {
              const Icon = option.icon;
              const active = filter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => patchFilters({ content: option.value })}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-4">
          <TraceFilterBar
            filters={filters}
            facets={facets}
            summary={filterSummary}
            onChange={(patch) => {
              patchFilters(patch);
              const dimension = Object.keys(patch)[0];
              if (dimension) trackEvent("personal_filter_used", { source: "vault", dimension });
            }}
            onClear={() => setFilters(EMPTY_FILTERS)}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="space-y-5">
          {/* Only on the unfiltered view: resurfacing is for browsing, not for searching. */}
          {!loading && !query && filter === "all" && (
            <ResurfacedRail
              traces={memories}
              source="vault"
              onOpen={(traceId) => {
                selectTrace(traceId);
                setDetailOpen(true);
              }}
            />
          )}
          {!loading && !query && filter === "all" && (
            <FeaturedStrip
              memories={memories}
              onSelect={(memory) => {
                selectTrace(memory.id);
                setDetailOpen(true);
              }}
            />
          )}
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card py-24 text-muted-foreground">
              <p className="text-sm">
                {query ? "No traces match your search." : "Your private Atlas is waiting for its first trace."}
              </p>
              {!query && (
                <Link className="text-sm font-semibold text-primary underline-offset-4 hover:underline" href="/#capture">
                  Create your first trace
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filtered.map((m) => (
                <MemoryCard
                  key={m.id}
                  memory={m}
                  onClick={() => {
                    selectTrace(m.id);
                    setDetailOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <TracePreviewCard
            memory={selected}
            title="Selected trace"
            onOpen={selected ? () => setDetailOpen(true) : undefined}
          />
          <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">How to browse</p>
            <ul className="mt-2 space-y-2 leading-6">
              <li>Open a card to inspect the full trace.</li>
              <li>Use search to jump across titles, places, and tags.</li>
              <li>Keep private traces here and move only selected ones public later.</li>
            </ul>
          </div>
        </aside>
      </div>

      <MemoryDetail
        memory={selected}
        open={detailOpen && !!selected}
        source="vault"
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}

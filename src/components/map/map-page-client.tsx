"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, ImageIcon, MapPin, Navigation, Route } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { useMemories, type Memory } from "@/lib/use-memories";
import { useSelectedTrace } from "@/lib/use-selected-trace";
import { MemoryDetail } from "@/components/memory/memory-detail";
import { TracePreviewCard } from "@/components/memory/trace-preview-card";
import { AtlasMap, type AtlasMapPoint } from "@/components/map/atlas-map";

type PlaceGroup = {
  place: string;
  items: Memory[];
  firstDate: string | null;
  latestDate: string | null;
  coverUrl: string | null;
  tags: string[];
  coordinates: { latitude: number; longitude: number } | null;
};

function dateValue(memory: Memory) {
  return memory.eventAt || memory.createdAt || null;
}

function formatDate(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Date not set";
}

function groupByPlace(memories: Memory[]) {
  const map = new Map<string, Memory[]>();
  for (const memory of memories) {
    const key = memory.place?.trim() || "Unplaced traces";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(memory);
  }
  return Array.from(map.entries())
    .map(([place, items]) => {
      const sorted = [...items].sort(
        (a, b) => new Date(dateValue(a) || 0).getTime() - new Date(dateValue(b) || 0).getTime(),
      );
      const coordinateMemory = sorted.find(
        (memory) => typeof memory.latitude === "number" && typeof memory.longitude === "number",
      );
      return {
        place,
        items: sorted,
        firstDate: dateValue(sorted[0]),
        latestDate: dateValue(sorted[sorted.length - 1]),
        coverUrl: sorted.find((memory) => memory.coverPhotoUrl)?.coverPhotoUrl || null,
        tags: Array.from(new Set(sorted.flatMap((memory) => memory.tags))).slice(0, 4),
        coordinates: coordinateMemory
          ? {
              latitude: coordinateMemory.latitude!,
              longitude: coordinateMemory.longitude!,
            }
          : null,
      } satisfies PlaceGroup;
    })
    .sort((a, b) => b.items.length - a.items.length);
}

function formatCoordinate(value: number) {
  return value.toFixed(5);
}

function JourneyLine({
  groups,
  selectedPlace,
  onSelect,
}: {
  groups: PlaceGroup[];
  selectedPlace: string | null;
  onSelect: (group: PlaceGroup) => void;
}) {
  return (
    <div className="relative space-y-3">
      <div className="absolute bottom-6 left-5 top-6 w-px bg-border" />
      {groups.map((group, index) => {
        const active = group.place === selectedPlace;
        return (
          <button
            key={group.place}
            type="button"
            onClick={() => onSelect(group)}
            className={`relative grid w-full grid-cols-[2.5rem_minmax(0,1fr)] gap-3 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <span
              className={`z-10 flex h-10 w-10 items-center justify-center rounded-full border ${
                active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-primary"
              }`}
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="flex items-start justify-between gap-2">
                <span className="line-clamp-1 font-serif text-lg font-semibold">{group.place}</span>
                <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                  {group.items.length}
                </span>
              </span>
              <span className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" aria-hidden />
                  {formatDate(group.firstDate)}
                </span>
                {group.coverUrl && (
                  <span className="inline-flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" aria-hidden />
                    Photos
                  </span>
                )}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function MapPageClient() {
  const { memories, loading } = useMemories();
  const openedTrackedRef = React.useRef(false);
  const [selectedPlace, setSelectedPlace] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const { selected, selectTrace } = useSelectedTrace(memories);

  React.useEffect(() => {
    if (loading || openedTrackedRef.current) return;
    openedTrackedRef.current = true;
    trackEvent("map_opened", { traceCount: memories.length });
  }, [loading, memories.length]);

  const groups = React.useMemo(() => groupByPlace(memories), [memories]);
  // Only user-confirmed coordinates are plotted. Nothing is geocoded from a place name
  // and nothing is inferred from story text.
  const mapPoints = React.useMemo<AtlasMapPoint[]>(
    () =>
      memories
        .filter(
          (memory) =>
            Boolean(memory.id) &&
            typeof memory.latitude === "number" &&
            typeof memory.longitude === "number" &&
            Math.abs(memory.latitude) <= 90 &&
            Math.abs(memory.longitude) <= 180,
        )
        .map((memory) => ({
          id: memory.id as string,
          label: memory.place?.trim() || memory.title || "Located trace",
          latitude: memory.latitude as number,
          longitude: memory.longitude as number,
          sortKey: new Date(dateValue(memory) || 0).getTime(),
        })),
    [memories],
  );
  const unlocatedCount = memories.length - mapPoints.length;
  const selectedGroup = React.useMemo(
    () =>
      groups.find((group) => group.items.some((memory) => memory.id === selected?.id)) ||
      groups.find((group) => group.place === selectedPlace) ||
      groups[0] ||
      null,
    [groups, selected?.id, selectedPlace],
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Your Life Atlas</p>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="font-serif text-5xl font-semibold">Your places, connected</h1>
            <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
              Move through your Atlas by location, then open the trace that gives each place its meaning.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border bg-background px-3 py-1">
              {loading ? "Loading..." : `${memories.length} traces`}
            </span>
            <span className="rounded-full border border-border bg-background px-3 py-1">
              {groups.length} places
            </span>
          </div>
        </div>
      </section>

      {!loading && memories.length === 0 ? (
        <section className="relative min-h-[28rem] overflow-hidden rounded-2xl border border-border bg-card p-8">
          <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_center,var(--tt-line)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="relative flex min-h-[24rem] flex-col items-center justify-center text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background">
              <MapPin className="h-6 w-6 text-primary" aria-hidden />
            </span>
            <h2 className="mt-6 font-serif text-3xl font-semibold">No places to connect yet</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              Create a trace with a confirmed place. It will become the first point in your private
              map and stay connected to the same event in your timeline.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/#capture" className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background">
                Create a trace
              </Link>
              <Link href="/timeline" className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold">
                <Route className="h-4 w-4" aria-hidden />
                Open timeline
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)_20rem]">
          <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Navigation className="h-4 w-4 text-primary" aria-hidden />
              Place route
            </div>
            <JourneyLine
              groups={groups}
              selectedPlace={selectedGroup?.place ?? null}
              onSelect={(group) => {
                const latest = group.items[group.items.length - 1];
                setSelectedPlace(group.place);
                selectTrace(latest?.id);
              }}
            />
          </aside>

          <section className="space-y-4">
            <AtlasMap
              points={mapPoints}
              selectedId={selected?.id ?? null}
              onSelect={(traceId) => {
                const memory = memories.find((item) => item.id === traceId);
                if (memory) setSelectedPlace(memory.place?.trim() || "Unplaced traces");
                selectTrace(traceId);
              }}
              onOpen={(traceId) => {
                selectTrace(traceId);
                setDetailOpen(true);
              }}
            />
            {unlocatedCount > 0 && (
              <p className="rounded-2xl border border-border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">
                {unlocatedCount} {unlocatedCount === 1 ? "trace has" : "traces have"} no confirmed coordinates yet.
                {" "}
                They stay reachable in the place route and the list below.
              </p>
            )}
            {selectedGroup && (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {selectedGroup.coverUrl ? (
                  <div className="relative h-56 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selectedGroup.coverUrl} alt="" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/70">Selected Place</p>
                      <h2 className="mt-1 font-serif text-4xl font-semibold">{selectedGroup.place}</h2>
                    </div>
                  </div>
                ) : (
                  <div className="p-5">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Selected Place</p>
                    <h2 className="mt-1 font-serif text-4xl font-semibold">{selectedGroup.place}</h2>
                  </div>
                )}
                <div className="grid gap-4 p-5 md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Traces</p>
                    <p className="mt-1 font-serif text-2xl font-semibold">{selectedGroup.items.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">First memory</p>
                    <p className="mt-1 text-sm font-medium">{formatDate(selectedGroup.firstDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Latest memory</p>
                    <p className="mt-1 text-sm font-medium">{formatDate(selectedGroup.latestDate)}</p>
                  </div>
                </div>
                {selectedGroup.coordinates && (
                  <div className="border-t border-border px-5 py-4">
                    <p className="text-xs text-muted-foreground">Map coordinates</p>
                    <p className="mt-1 font-mono text-sm">
                      {formatCoordinate(selectedGroup.coordinates.latitude)}, {formatCoordinate(selectedGroup.coordinates.longitude)}
                    </p>
                  </div>
                )}
                {selectedGroup.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4">
                    {selectedGroup.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-accent/30 px-3 py-1 text-xs font-medium">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl font-semibold">Traces in this place</h2>
                <Link href="/vault" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  Browse atlas
                </Link>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {(selectedGroup?.items ?? memories).slice().reverse().map((memory) => (
                  <button
                    key={memory.id}
                    type="button"
                    onClick={() => {
                      selectTrace(memory.id);
                      setDetailOpen(true);
                    }}
                    className={`rounded-2xl border bg-background p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${
                      selected?.id === memory.id ? "border-primary shadow-md" : "border-border"
                    }`}
                  >
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      {memory.place || "Unplaced"}
                    </p>
                    <h3 className="mt-2 line-clamp-2 font-serif text-xl font-semibold">{memory.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(dateValue(memory))}</p>
                    {typeof memory.latitude === "number" && typeof memory.longitude === "number" && (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {formatCoordinate(memory.latitude)}, {formatCoordinate(memory.longitude)}
                      </p>
                    )}
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{memory.story}</p>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <TracePreviewCard memory={selected} title="Selected place trace" onOpen={selected ? () => setDetailOpen(true) : undefined} />
            <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Map view</p>
              <p className="mt-2 leading-6">
                Each place keeps its own short stack of traces, so the same memory can be reached from the library,
                timeline, or map without losing context.
              </p>
            </div>
          </aside>
        </div>
      )}

      <MemoryDetail
        memory={selected}
        open={detailOpen && !!selected}
        source="map"
        onClose={() => setDetailOpen(false)}
      />
    </main>
  );
}

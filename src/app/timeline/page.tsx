"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import { useMemories, type Memory } from "@/lib/use-memories";
import { useSelectedTrace } from "@/lib/use-selected-trace";
import { MemoryDetail } from "@/components/memory/memory-detail";
import { TracePreviewCard } from "@/components/memory/trace-preview-card";
import { Skeleton } from "@/components/ui/skeleton";

function groupByMonth(memories: Memory[]) {
  const map = new Map<string, Memory[]>();
  for (const m of memories) {
    const sourceDate = m.eventAt || m.createdAt;
    const key = sourceDate
      ? new Date(sourceDate).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
        })
      : "Date not set";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return Array.from(map.entries());
}

function TimelineEntry({
  memory,
  onClick,
}: {
  memory: Memory;
  onClick: () => void;
}) {
  const sourceDate = memory.eventAt || memory.createdAt;
  const date = sourceDate ? new Date(sourceDate) : null;
  return (
    <div className="flex gap-4">
      {/* Left: date column */}
      <div className="flex w-16 shrink-0 flex-col items-end pt-1 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">
          {date ? date.toLocaleDateString("en-US", { day: "2-digit" }) : "--"}
        </span>
        <span className="text-[10px]">
          {date ? date.toLocaleDateString("en-US", { weekday: "short" }) : "Unsorted"}
        </span>
      </div>

      {/* Center: timeline rail */}
      <div className="relative flex flex-col items-center">
        <div className="z-10 mt-1.5 h-3 w-3 rounded-full border-2 border-primary bg-background" />
        <div className="w-px flex-1 bg-border" />
      </div>

      {/* Right: card */}
      <button
        type="button"
        onClick={onClick}
        className="mb-4 flex flex-1 flex-col gap-2 overflow-hidden rounded-3xl border border-border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <p className="line-clamp-1 font-serif text-sm font-semibold">
          {memory.title}
        </p>
        {memory.place && (
          <p className="text-xs text-muted-foreground">{memory.place}</p>
        )}
        <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {memory.story}
        </p>
        {memory.coverPhotoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={memory.coverPhotoUrl}
            alt=""
            className="mt-1 h-36 w-full rounded-2xl object-cover"
          />
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-muted-foreground/60">
            {memory.tags.slice(0, 2).join(" · ")}
          </span>
          <span className="text-[10px] font-medium text-primary">Open detail</span>
        </div>
      </button>
    </div>
  );
}

function SkeletonEntry() {
  return (
    <div className="flex gap-4">
      <div className="flex w-16 shrink-0 flex-col items-end gap-1 pt-1">
        <Skeleton className="h-3 w-10" />
        <Skeleton className="h-2 w-8" />
      </div>
      <div className="relative flex flex-col items-center">
        <Skeleton className="mt-1.5 h-3 w-3 rounded-full" />
        <div className="w-px flex-1 bg-border" />
      </div>
      <div className="mb-4 flex flex-1 flex-col gap-2 rounded-2xl border border-border bg-card p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}

export default function TimelinePage() {
  const { memories, loading } = useMemories();
  const openedTrackedRef = React.useRef(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const { selected, selectTrace } = useSelectedTrace(memories);

  React.useEffect(() => {
    if (loading || openedTrackedRef.current) return;
    openedTrackedRef.current = true;
    trackEvent("timeline_opened", { traceCount: memories.length });
  }, [loading, memories.length]);

  const groups = groupByMonth(memories);

  return (
    <div className="flex flex-col gap-6 p-6">
      <section className="rounded-[2rem] border border-border bg-card p-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Timeline</p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="font-serif text-4xl font-semibold">Revisit the story as it unfolded</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Time becomes easier to revisit when each moment keeps its date, place, people, and story together.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading..." : `${memories.length} ${memories.length === 1 ? "trace" : "traces"}`}
          </p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="space-y-4">
          {loading ? (
            <div className="flex flex-col">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonEntry key={i} />
              ))}
            </div>
          ) : memories.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[2rem] border border-border bg-card py-24 text-muted-foreground">
              <p className="font-serif text-2xl text-foreground">Your story starts with one trace.</p>
              <Link className="text-sm font-semibold text-primary underline-offset-4 hover:underline" href="/#capture">
                Create your first trace
              </Link>
            </div>
          ) : (
            <div className="flex flex-col">
              {groups.map(([month, items]) => (
                <div key={month}>
                  <div className="flex gap-4">
                    <div className="w-16 shrink-0" />
                    <div className="relative flex flex-col items-center">
                      <div className="w-px flex-1 bg-transparent" />
                    </div>
                    <div className="mb-2 flex-1">
                      <span className="rounded-full bg-accent/30 px-3 py-0.5 text-xs font-medium text-foreground">
                        {month}
                      </span>
                    </div>
                  </div>
                  {items.map((m) => (
                    <TimelineEntry
                      key={m.id}
                      memory={m}
                      onClick={() => {
                        selectTrace(m.id);
                        setDetailOpen(true);
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <TracePreviewCard
            memory={selected}
            title="Selected moment"
            onOpen={selected ? () => setDetailOpen(true) : undefined}
          />
          <div className="mt-4 rounded-3xl border border-border bg-card p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Timeline cues</p>
            <ul className="mt-2 space-y-2 leading-6">
              <li>Click a moment to inspect the full story and image set.</li>
              <li>Blank dates stay grouped as unsorted instead of breaking the flow.</li>
              <li>Use the timeline to jump forward and backward through the Atlas.</li>
            </ul>
          </div>
        </aside>
      </div>

      <MemoryDetail
        memory={selected}
        open={detailOpen && !!selected}
        source="timeline"
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}

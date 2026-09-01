"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Memory } from "@/lib/use-memories";

export function TracePreviewCard({
  memory,
  onOpen,
  title = "Trace preview",
}: {
  memory: Memory | null;
  onOpen?: () => void;
  title?: string;
}) {
  if (!memory) {
    return (
      <div className="rounded-3xl border border-border bg-card p-5 text-sm text-muted-foreground">
        {title}
      </div>
    );
  }

  const displayDate = memory.eventAt || memory.createdAt;
  const dateLabel = displayDate
    ? new Date(displayDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Date not set";

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      {memory.coverPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={memory.coverPhotoUrl} alt="" className="aspect-[4/3] w-full object-cover" />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-accent/20 text-3xl">
          📍
        </div>
      )}
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {title}
            </p>
            <h3 className="mt-1 line-clamp-2 font-serif text-xl font-semibold leading-tight">{memory.title}</h3>
          </div>
          {memory.isPublic !== undefined && (
            <Badge variant={memory.isPublic ? "default" : "secondary"} className="shrink-0">
              {memory.isPublic ? "Public" : "Private"}
            </Badge>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          {dateLabel}
          {memory.place ? ` · ${memory.place}` : ""}
          {memory.mood ? ` · ${memory.mood}` : ""}
        </p>

        <p className="line-clamp-4 text-sm leading-6 text-foreground/90">{memory.story}</p>

        {memory.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {memory.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        {memory.people && memory.people.length > 0 && (
          <p className="text-xs text-muted-foreground">
            People: {memory.people.slice(0, 4).join(", ")}
          </p>
        )}

        {onOpen && (
          <Button type="button" variant="outline" className="mt-1 w-full" onClick={onOpen}>
            Open detail
          </Button>
        )}
      </div>
    </div>
  );
}


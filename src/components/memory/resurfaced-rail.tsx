"use client";

/**
 * Resurfacing rail (M3-003).
 *
 * Shows traces the user already saved, with the reason they came back. It creates nothing:
 * no request, no AI call, no new row. The selection is computed from the traces already
 * loaded for the page.
 */

import * as React from "react";
import { History } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { resurfaceTraces, type ResurfaceableTrace } from "@/lib/resurfacing";

export function ResurfacedRail<T extends ResurfaceableTrace>({
  traces,
  source,
  onOpen,
}: {
  traces: T[];
  source: string;
  onOpen: (traceId: string) => void;
}) {
  /**
   * Recomputed only when the traces change, and anchored to the current day.
   *
   * The date is read once per mount rather than on every render so the rail cannot reshuffle
   * itself mid-session.
   */
  const today = React.useMemo(() => new Date(), []);
  const items = React.useMemo(
    () => resurfaceTraces(traces, { now: today, limit: 3 }),
    [traces, today],
  );

  const shownRef = React.useRef("");
  React.useEffect(() => {
    if (items.length === 0) return;
    const signature = items.map((item) => `${item.trace.id}:${item.reason}`).join("|");
    if (shownRef.current === signature) return;
    shownRef.current = signature;
    trackEvent("memory_resurfaced", { source, count: items.length, reason: items[0].reason });
  }, [items, source]);

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="resurfaced-heading" className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-primary" aria-hidden />
        <h2 id="resurfaced-heading" className="font-serif text-xl font-semibold">
          Worth looking at again
        </h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Traces you already saved. Nothing new was generated.
      </p>

      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.trace.id}>
            <button
              type="button"
              onClick={() => {
                if (!item.trace.id) return;
                trackEvent("old_trace_revisited", {
                  source,
                  reason: item.reason,
                  yearsAgo: item.yearsAgo ?? 0,
                });
                onOpen(item.trace.id);
              }}
              className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-background text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.trace.coverPhotoUrl ? (
                <span className="block h-24 w-full overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.trace.coverPhotoUrl} alt="" className="h-full w-full object-cover" />
                </span>
              ) : (
                <span className="block h-24 w-full bg-accent/20" />
              )}
              <span className="flex flex-1 flex-col p-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
                  {item.label}
                </span>
                <span className="mt-1 line-clamp-2 font-serif text-base font-semibold">
                  {item.trace.title}
                </span>
                {item.trace.place && (
                  <span className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                    {item.trace.place}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

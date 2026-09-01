"use client";

/**
 * Private coordinate map for the personal Atlas.
 *
 * Deliberately renders from a first-party land outline instead of a tile service. Trace
 * coordinates are private, and tile requests would tell a third-party provider which part
 * of the world the user is looking at on every pan and zoom. Browsing this map makes no
 * third-party request.
 *
 * The geometry lives in `src/lib/atlas-projection.ts` so it can be tested directly.
 */

import * as React from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  groupMarkers,
  projectX,
  projectY,
  ringPath,
  routePath,
  viewForPoints,
  zoomView,
  clampView,
  type AtlasMapPoint,
  type MarkerGroup,
  type View,
} from "@/lib/atlas-projection";

export type { AtlasMapPoint } from "@/lib/atlas-projection";

const LAND_ASSET = "/world-land.json";

type LandData = { rings: number[][] };

export function AtlasMap({
  points,
  selectedId,
  onSelect,
  onOpen,
}: {
  points: AtlasMapPoint[];
  selectedId: string | null;
  onSelect: (traceId: string) => void;
  /** Called when an already selected marker is activated again. */
  onOpen?: (traceId: string) => void;
}) {
  const [land, setLand] = React.useState<LandData | null>(null);
  const [landFailed, setLandFailed] = React.useState(false);
  const [view, setView] = React.useState<View>(() => viewForPoints(points));
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const dragRef = React.useRef<{ pointerId: number; startX: number; startY: number; view: View } | null>(null);
  const fittedRef = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch(LAND_ASSET)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("land_unavailable"))))
      .then((data: LandData) => {
        if (!cancelled) setLand(data);
      })
      .catch(() => {
        // The map stays usable without the outline: the graticule and the points remain.
        if (!cancelled) setLandFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fit once when coordinates first arrive, then leave the view under user control.
  React.useEffect(() => {
    if (fittedRef.current || points.length === 0) return;
    fittedRef.current = true;
    setView(viewForPoints(points));
  }, [points]);

  const markers = React.useMemo(() => groupMarkers(points), [points]);
  const landPaths = React.useMemo(() => (land ? land.rings.map(ringPath) : []), [land]);
  const route = React.useMemo(() => routePath(points), [points]);

  /** Scale-independent sizing so markers and strokes stay legible when zoomed in. */
  const unit = view.w / WORLD_WIDTH;

  function zoomBy(factor: number, anchor?: { x: number; y: number }) {
    setView((current) => zoomView(current, factor, anchor));
  }

  function clientToWorld(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: view.x + ((clientX - rect.left) / rect.width) * view.w,
      y: view.y + ((clientY - rect.top) / rect.height) * view.h,
    };
  }

  function handleWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const anchor = clientToWorld(event.clientX, event.clientY) ?? undefined;
    zoomBy(event.deltaY > 0 ? 1.2 : 1 / 1.2, anchor);
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, view };
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const dx = ((event.clientX - drag.startX) / rect.width) * drag.view.w;
    const dy = ((event.clientY - drag.startY) / rect.height) * drag.view.h;
    setView(clampView({ ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy }));
  }

  function endDrag(event: React.PointerEvent<SVGSVGElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
  }

  function activate(group: MarkerGroup) {
    const alreadySelected = group.points.some((point) => point.id === selectedId);
    const target =
      group.points.find((point) => point.id === selectedId) ??
      [...group.points].sort((a, b) => b.sortKey - a.sortKey)[0];
    if (!target) return;
    if (alreadySelected && onOpen) {
      onOpen(target.id);
      return;
    }
    onSelect(target.id);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Located traces</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {points.length === 0
              ? "No confirmed coordinates yet"
              : `${points.length} ${points.length === 1 ? "trace" : "traces"} on the map`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.4)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background transition hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1.4)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background transition hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setView(viewForPoints(points))}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background transition hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Fit all located traces"
          >
            <Maximize2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className="h-[22rem] w-full touch-none select-none md:h-[26rem]"
        // Inline so the water tint follows the theme tokens without relying on an
        // arbitrary utility class being generated.
        style={{ background: "color-mix(in oklab, var(--tt-line) 22%, transparent)" }}
        role="group"
        aria-label="Map of traces with confirmed coordinates"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <g stroke="var(--tt-line)" strokeWidth={0.4 * unit} opacity={0.6}>
          {[-60, -30, 0, 30, 60].map((latitude) => (
            <line key={`lat-${latitude}`} x1={0} y1={projectY(latitude)} x2={WORLD_WIDTH} y2={projectY(latitude)} />
          ))}
          {[-120, -60, 0, 60, 120].map((longitude) => (
            <line key={`lng-${longitude}`} x1={projectX(longitude)} y1={0} x2={projectX(longitude)} y2={WORLD_HEIGHT} />
          ))}
        </g>

        <g
          fill="color-mix(in oklab, var(--foreground) 12%, transparent)"
          stroke="color-mix(in oklab, var(--foreground) 30%, transparent)"
          strokeWidth={0.3 * unit}
        >
          {landPaths.map((path, index) => (
            <path key={index} d={path} />
          ))}
        </g>

        {route && (
          <path
            d={route}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={0.6 * unit}
            strokeDasharray={`${2.5 * unit} ${2 * unit}`}
            opacity={0.5}
          />
        )}

        {markers.map((group) => {
          const active = group.points.some((point) => point.id === selectedId);
          const label = group.points[0]?.label || "Located trace";
          const description =
            group.points.length > 1 ? `${label} and ${group.points.length - 1} more traces here` : label;
          return (
            <g
              key={group.key}
              role="button"
              tabIndex={0}
              aria-label={description}
              aria-pressed={active}
              className="cursor-pointer focus-visible:outline-none"
              onClick={(event) => {
                event.stopPropagation();
                activate(group);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                activate(group);
              }}
            >
              {/* Invisible larger hit area keeps small markers reachable by touch. */}
              <circle cx={group.x} cy={group.y} r={5 * unit} fill="transparent" />
              <circle
                cx={group.x}
                cy={group.y}
                r={(active ? 3.2 : 2.2) * unit}
                fill={active ? "var(--primary)" : "var(--background)"}
                stroke="var(--primary)"
                strokeWidth={0.8 * unit}
              />
              {group.points.length > 1 && (
                <text
                  x={group.x}
                  y={group.y + 1.1 * unit}
                  textAnchor="middle"
                  fontSize={2.8 * unit}
                  fill={active ? "var(--primary-foreground)" : "var(--primary)"}
                >
                  {group.points.length}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <p className="border-t border-border px-4 py-3 text-xs leading-5 text-muted-foreground">
        {points.length === 0
          ? "Add confirmed latitude and longitude to a trace and it will appear here."
          : "Drag to pan, scroll or pinch to zoom, and select a point to load that trace. Selecting the same point again opens it."}
        {landFailed && " The world outline could not be loaded, so only coordinates are shown."}
        <span className="mt-1 block">
          Rendered from a bundled outline on this site. No map data is requested from any third party.
        </span>
      </p>
    </div>
  );
}

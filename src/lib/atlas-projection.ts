/**
 * Pure geometry for the private Atlas map.
 *
 * Kept separate from the React component so the projection, view fitting, and marker
 * grouping can be tested directly instead of being inferred from a screenshot.
 *
 * Projection is plain equirectangular: longitude maps linearly to x in `0..360` and
 * latitude to y in `0..180`, with y increasing southwards to match SVG coordinates.
 */

export const WORLD_WIDTH = 360;
export const WORLD_HEIGHT = 180;
export const MIN_VIEW_WIDTH = 4;

export type AtlasMapPoint = {
  /** Trace id used for selection. */
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  /** Sort key used to connect points in chronological order. */
  sortKey: number;
};

export type View = { x: number; y: number; w: number; h: number };

export const WHOLE_WORLD: View = { x: 0, y: 0, w: WORLD_WIDTH, h: WORLD_HEIGHT };

export function projectX(longitude: number): number {
  return longitude + 180;
}

export function projectY(latitude: number): number {
  return 90 - latitude;
}

/** Keeps a view inside the world and at a sane zoom level, preserving aspect ratio. */
export function clampView(view: View): View {
  const w = Math.min(Math.max(view.w, MIN_VIEW_WIDTH), WORLD_WIDTH);
  const h = (w * WORLD_HEIGHT) / WORLD_WIDTH;
  return {
    w,
    h,
    x: Math.min(Math.max(view.x, 0), WORLD_WIDTH - w),
    y: Math.min(Math.max(view.y, 0), WORLD_HEIGHT - h),
  };
}

export function viewForPoints(points: AtlasMapPoint[]): View {
  if (points.length === 0) return WHOLE_WORLD;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    const x = projectX(point.longitude);
    const y = projectY(point.latitude);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  // A single point would otherwise produce a zero-size box, so every fit gets generous
  // padding and a floor wide enough to show recognisable surroundings.
  const spanX = Math.max(maxX - minX, 0);
  const spanY = Math.max(maxY - minY, 0);
  const padding = Math.max(spanX, spanY * (WORLD_WIDTH / WORLD_HEIGHT), 12) * 0.6;
  const width = Math.max(spanX + padding * 2, ((spanY + padding * 2) * WORLD_WIDTH) / WORLD_HEIGHT, 24);
  const height = (width * WORLD_HEIGHT) / WORLD_WIDTH;

  return clampView({
    w: width,
    h: height,
    x: (minX + maxX) / 2 - width / 2,
    y: (minY + maxY) / 2 - height / 2,
  });
}

/** Traces recorded at the same spot are drawn once with a count. */
export type MarkerGroup = {
  key: string;
  x: number;
  y: number;
  points: AtlasMapPoint[];
};

export function groupMarkers(points: AtlasMapPoint[]): MarkerGroup[] {
  const groups = new Map<string, MarkerGroup>();
  for (const point of points) {
    const x = projectX(point.longitude);
    const y = projectY(point.latitude);
    const key = `${x.toFixed(3)}:${y.toFixed(3)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.points.push(point);
    } else {
      groups.set(key, { key, x, y, points: [point] });
    }
  }
  return Array.from(groups.values());
}

/** Flat `[lng, lat, lng, lat, ...]` ring to an SVG path in projected space. */
export function ringPath(ring: number[]): string {
  let path = "";
  for (let i = 0; i < ring.length; i += 2) {
    const x = projectX(ring[i]);
    const y = projectY(ring[i + 1]);
    path += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${path}Z`;
}

/** Dashed chronological connector between located traces. */
export function routePath(points: AtlasMapPoint[]): string {
  if (points.length < 2) return "";
  return [...points]
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${projectX(point.longitude).toFixed(2)} ${projectY(point.latitude).toFixed(2)}`,
    )
    .join("");
}

/** Zoom a view by `factor`, keeping `anchor` fixed when supplied. */
export function zoomView(current: View, factor: number, anchor?: { x: number; y: number }): View {
  const nextWidth = Math.min(Math.max(current.w * factor, MIN_VIEW_WIDTH), WORLD_WIDTH);
  const nextHeight = (nextWidth * WORLD_HEIGHT) / WORLD_WIDTH;
  const focusX = anchor?.x ?? current.x + current.w / 2;
  const focusY = anchor?.y ?? current.y + current.h / 2;
  const ratio = nextWidth / current.w;
  return clampView({
    w: nextWidth,
    h: nextHeight,
    x: focusX - (focusX - current.x) * ratio,
    y: focusY - (focusY - current.y) * ratio,
  });
}

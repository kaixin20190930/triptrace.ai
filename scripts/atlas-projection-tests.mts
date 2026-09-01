// Geometry tests for the private Atlas map.
//
// Run with: npm run test:map
// Uses Node's built-in type stripping, so no test framework or build step is involved.

import { readFileSync } from "node:fs";
import {
  WORLD_HEIGHT,
  WORLD_WIDTH,
  MIN_VIEW_WIDTH,
  clampView,
  groupMarkers,
  projectX,
  projectY,
  ringPath,
  routePath,
  viewForPoints,
  zoomView,
  type AtlasMapPoint,
} from "../src/lib/atlas-projection.ts";

let failures = 0;
let total = 0;

function check(name: string, passed: boolean, detail = "") {
  total += 1;
  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

function close(a: number, b: number, tolerance = 1e-6) {
  return Math.abs(a - b) <= tolerance;
}

function point(id: string, latitude: number, longitude: number, sortKey = 0): AtlasMapPoint {
  return { id, label: id, latitude, longitude, sortKey };
}

// ---------------------------------------------------------------- projection
check("null island projects to the centre of the world", close(projectX(0), 180) && close(projectY(0), 90));
check("the antimeridian west edge projects to x=0", close(projectX(-180), 0));
check("the antimeridian east edge projects to the full width", close(projectX(180), WORLD_WIDTH));
check("the north pole projects to y=0", close(projectY(90), 0));
check("the south pole projects to the full height", close(projectY(-90), WORLD_HEIGHT));
check(
  "a known city lands where it should",
  // Porto: 41.15 N, 8.61 W
  close(projectX(-8.61), 171.39, 1e-9) && close(projectY(41.15), 48.85, 1e-9),
  `${projectX(-8.61)}, ${projectY(41.15)}`,
);
check("latitude increases northwards while y increases southwards", projectY(50) < projectY(10));

// ---------------------------------------------------------------- view clamping
const overZoomed = clampView({ x: 0, y: 0, w: 0.001, h: 0.001 });
check("a view cannot zoom past the minimum width", close(overZoomed.w, MIN_VIEW_WIDTH), String(overZoomed.w));
const overWide = clampView({ x: -50, y: -50, w: 10_000, h: 10_000 });
check(
  "a view cannot exceed the world or drift outside it",
  close(overWide.w, WORLD_WIDTH) && close(overWide.h, WORLD_HEIGHT) && overWide.x === 0 && overWide.y === 0,
  JSON.stringify(overWide),
);
const clamped = clampView({ x: 400, y: 300, w: 60, h: 30 });
check(
  "panning past the eastern and southern edges is stopped at the edge",
  close(clamped.x, WORLD_WIDTH - 60) && close(clamped.y, WORLD_HEIGHT - 30),
  JSON.stringify(clamped),
);
check(
  "clamping always preserves the 2:1 world aspect ratio",
  close(clamped.w / clamped.h, WORLD_WIDTH / WORLD_HEIGHT),
);

// ---------------------------------------------------------------- fitting
check(
  "no points shows the whole world",
  JSON.stringify(viewForPoints([])) === JSON.stringify({ x: 0, y: 0, w: WORLD_WIDTH, h: WORLD_HEIGHT }),
);

const singleView = viewForPoints([point("a", 41.15, -8.61)]);
check(
  "a single point produces a usable non-zero view",
  singleView.w >= 24 && singleView.h > 0,
  JSON.stringify(singleView),
);
check(
  "a single point stays inside its fitted view",
  projectX(-8.61) >= singleView.x &&
    projectX(-8.61) <= singleView.x + singleView.w &&
    projectY(41.15) >= singleView.y &&
    projectY(41.15) <= singleView.y + singleView.h,
);

const spread = [point("a", 41.15, -8.61), point("b", 35.68, 139.69), point("c", -33.87, 151.21)];
const spreadView = viewForPoints(spread);
const allInside = spread.every(
  (p) =>
    projectX(p.longitude) >= spreadView.x - 1e-9 &&
    projectX(p.longitude) <= spreadView.x + spreadView.w + 1e-9 &&
    projectY(p.latitude) >= spreadView.y - 1e-9 &&
    projectY(p.latitude) <= spreadView.y + spreadView.h + 1e-9,
);
check("widely spread points all fit inside the fitted view", allInside, JSON.stringify(spreadView));
check(
  "a fitted view never leaves the world bounds",
  spreadView.x >= 0 &&
    spreadView.y >= 0 &&
    spreadView.x + spreadView.w <= WORLD_WIDTH + 1e-9 &&
    spreadView.y + spreadView.h <= WORLD_HEIGHT + 1e-9,
);

// ---------------------------------------------------------------- zooming
const start = { x: 100, y: 50, w: 60, h: 30 };
const anchor = { x: 130, y: 65 };
const zoomedIn = zoomView(start, 0.5, anchor);
check("zooming in halves the view width", close(zoomedIn.w, 30), String(zoomedIn.w));
check(
  "the anchor point stays at the same relative position while zooming",
  close((anchor.x - zoomedIn.x) / zoomedIn.w, (anchor.x - start.x) / start.w) &&
    close((anchor.y - zoomedIn.y) / zoomedIn.h, (anchor.y - start.y) / start.h),
);
check("zooming out is bounded by the world width", close(zoomView(start, 100).w, WORLD_WIDTH));
check("zooming in is bounded by the minimum width", close(zoomView(start, 0.0001).w, MIN_VIEW_WIDTH));

// ---------------------------------------------------------------- markers
const shared = groupMarkers([
  point("a", 41.15, -8.61, 1),
  point("b", 41.15, -8.61, 2),
  point("c", 35.68, 139.69, 3),
]);
check("traces at the same coordinates collapse into one marker", shared.length === 2, `groups=${shared.length}`);
const sharedGroup = shared.find((group) => group.points.length === 2);
check("the shared marker keeps both traces", sharedGroup?.points.length === 2);
check(
  "a marker is positioned at the projected coordinate",
  close(sharedGroup!.x, projectX(-8.61)) && close(sharedGroup!.y, projectY(41.15)),
);
check("no points produces no markers", groupMarkers([]).length === 0);

// ---------------------------------------------------------------- route
check("a single point draws no connector", routePath([point("a", 0, 0)]) === "");
const orderedRoute = routePath([point("late", 0, 10, 200), point("early", 0, -10, 100)]);
check(
  "the connector follows chronological order, not input order",
  orderedRoute.startsWith(`M${projectX(-10).toFixed(2)}`),
  orderedRoute,
);

// ---------------------------------------------------------------- land asset
const land = JSON.parse(readFileSync("public/world-land.json", "utf8")) as {
  format: string;
  rings: number[][];
};
check("the land asset uses the expected format", land.format === "flat-lnglat-rings", land.format);
check("the land asset contains rings", land.rings.length > 50, `rings=${land.rings.length}`);
check(
  "every ring has paired coordinates",
  land.rings.every((ring) => ring.length % 2 === 0 && ring.length >= 8),
);
const outOfRange = land.rings.some((ring) => {
  for (let i = 0; i < ring.length; i += 2) {
    if (ring[i] < -180 || ring[i] > 180 || ring[i + 1] < -90 || ring[i + 1] > 90) return true;
  }
  return false;
});
check("every ring coordinate is a valid longitude and latitude", !outOfRange);
const samplePath = ringPath(land.rings[0]);
check(
  "a ring converts to a closed SVG path",
  samplePath.startsWith("M") && samplePath.endsWith("Z") && samplePath.includes("L"),
);
const totalPoints = land.rings.reduce((sum, ring) => sum + ring.length / 2, 0);
check("the land outline stays small enough to ship", totalPoints < 6000, `points=${totalPoints}`);

console.log("");
console.log(`${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);

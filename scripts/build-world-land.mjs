#!/usr/bin/env node
// Generates `public/world-land.json`, the outline used by the private Atlas map.
//
// Why a bundled first-party asset instead of a tile service: trace coordinates are
// private. Requesting map tiles from a third party would reveal which part of the world
// a user is looking at to that provider on every pan and zoom. This asset is served from
// our own origin, so browsing the Atlas map makes no third-party request at all.
//
// Source: Natural Earth 1:110m land polygons, public domain.
// https://github.com/nvkelso/natural-earth-vector
//
// Usage: node scripts/build-world-land.mjs [path-to-ne_110m_land.geojson]
// Regenerate only when the outline needs to change; the output is committed.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = process.argv[2] || "/tmp/ne_110m_land.geojson";
const OUTPUT = resolve(process.cwd(), "public/world-land.json");

/** Simplification tolerance in degrees. Coarse on purpose: this is a locator, not an atlas. */
const TOLERANCE = 0.35;
/** Rings smaller than this bounding area in square degrees are dropped. */
const MIN_RING_AREA = 1.2;
/** Coordinate precision. Two decimals is about one kilometre at the equator. */
const PRECISION = 2;

function perpendicularDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + clamped * dx), py - (ay + clamped * dy));
}

function simplify(points, tolerance) {
  if (points.length < 3) return points;
  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }
  if (maxDistance <= tolerance) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, index + 1), tolerance);
  const right = simplify(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

function boundingArea(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return (maxX - minX) * (maxY - minY);
}

function round(value) {
  const factor = 10 ** PRECISION;
  return Math.round(value * factor) / factor;
}

const source = JSON.parse(readFileSync(SOURCE, "utf8"));
const rings = [];

for (const feature of source.features) {
  const polygons =
    feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  for (const polygon of polygons) {
    // Only the outer ring is kept. Inland holes such as lakes are not needed for a
    // locator map and would double the payload.
    const [outer] = polygon;
    if (!outer || outer.length < 4) continue;
    if (boundingArea(outer) < MIN_RING_AREA) continue;
    const simplified = simplify(outer, TOLERANCE);
    if (simplified.length < 4) continue;
    rings.push(simplified.map(([lng, lat]) => [round(lng), round(lat)]).flat());
  }
}

rings.sort((a, b) => b.length - a.length);

const output = {
  format: "flat-lnglat-rings",
  source: "Natural Earth 1:110m land (public domain)",
  toleranceDegrees: TOLERANCE,
  precision: PRECISION,
  rings,
};

writeFileSync(OUTPUT, JSON.stringify(output));
const points = rings.reduce((total, ring) => total + ring.length / 2, 0);
console.log(`Wrote ${OUTPUT}`);
console.log(`${rings.length} rings, ${points} points, ${(JSON.stringify(output).length / 1024).toFixed(1)} KB`);

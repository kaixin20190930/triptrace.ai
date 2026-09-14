/**
 * Groups imported photos into candidate traces (M2-004).
 *
 * The product problem this solves: a single real trip produces hundreds of photos, but a
 * trace holds at most 20. Asking someone to hand-pick 20 photos at a time makes the
 * product unusable for exactly the person it is meant for.
 *
 * Two rules constrain the algorithm, both inherited from the fact/narrative separation:
 *
 *  1. Nothing is invented. A suggested date or coordinate is only ever copied from photo
 *     metadata that actually exists. Photos with no date are never merged into a dated
 *     group, because that would silently assign them a date they do not have.
 *  2. Every suggestion stays editable. The output is labelled "candidate", and the user
 *     confirms or corrects it before anything is saved.
 *
 * No geocoding happens here. Place names remain the user's to supply.
 */

/** A new group starts when the gap since the previous photo exceeds this. */
export const DEFAULT_TIME_GAP_HOURS = 6;

/** A new group starts when the distance from the last known position exceeds this. */
export const DEFAULT_DISTANCE_KM = 30;

/** Matches the per-trace image limit enforced by the entitlement layer. */
export const DEFAULT_MAX_PHOTOS_PER_CLUSTER = 20;

export type ClusterablePhoto = {
  /** Stable identifier, typically the file name plus size. */
  id: string;
  filename: string;
  /** ISO timestamp from EXIF, or null when the photo carries no date. */
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type ClusterSplitReason = "first" | "time_gap" | "distance" | "size_limit" | "undated";

export type PhotoCluster = {
  id: string;
  photos: ClusterablePhoto[];
  /** Why this group was started, which is also what the UI explains to the user. */
  reason: ClusterSplitReason;
  /** Earliest known capture time, or null when no photo in the group has one. */
  suggestedEventAt: string | null;
  /** `day` when a date exists, `unknown` otherwise. Never guessed. */
  suggestedDatePrecision: "day" | "unknown";
  /** Median of available coordinates, or null when no photo has any. */
  suggestedLatitude: number | null;
  suggestedLongitude: number | null;
  /** Last known capture time in the group, for showing a range. */
  lastEventAt: string | null;
  /** How many photos in the group carried usable metadata. */
  datedCount: number;
  locatedCount: number;
};

export type ClusteringOptions = {
  timeGapHours?: number;
  distanceKm?: number;
  maxPhotosPerCluster?: number;
};

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in kilometres. */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function hasCoordinates(photo: ClusterablePhoto): boolean {
  return (
    typeof photo.latitude === "number" &&
    typeof photo.longitude === "number" &&
    Math.abs(photo.latitude) <= 90 &&
    Math.abs(photo.longitude) <= 180
  );
}

function timestamp(photo: ClusterablePhoto): number | null {
  if (!photo.capturedAt) return null;
  const value = new Date(photo.capturedAt).getTime();
  return Number.isFinite(value) ? value : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Summarises a group.
 *
 * The median is used rather than the mean so one bad GPS fix, which phones do produce,
 * cannot drag the suggested location across a city.
 *
 * Known limitation: latitude and longitude are taken independently, so a group straddling
 * the antimeridian would produce a misleading suggestion. Groups are bounded to a small
 * radius, and the value is user-editable, so this is accepted rather than solved here.
 */
function summarise(
  id: string,
  photos: ClusterablePhoto[],
  reason: ClusterSplitReason,
): PhotoCluster {
  const times = photos.map(timestamp).filter((value): value is number => value !== null);
  const located = photos.filter(hasCoordinates);
  const suggestedEventAt = times.length ? new Date(Math.min(...times)).toISOString() : null;

  return {
    id,
    photos,
    reason,
    suggestedEventAt,
    suggestedDatePrecision: suggestedEventAt ? "day" : "unknown",
    suggestedLatitude: median(located.map((photo) => photo.latitude as number)),
    suggestedLongitude: median(located.map((photo) => photo.longitude as number)),
    lastEventAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    datedCount: times.length,
    locatedCount: located.length,
  };
}

/** Splits an oversized group into consecutive chunks that fit the per-trace limit. */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function clusterPhotos(
  photos: ClusterablePhoto[],
  options: ClusteringOptions = {},
): PhotoCluster[] {
  const timeGapMs = Math.max(0, options.timeGapHours ?? DEFAULT_TIME_GAP_HOURS) * 3_600_000;
  const maxDistance = Math.max(0, options.distanceKm ?? DEFAULT_DISTANCE_KM);
  const maxPerCluster = Math.max(1, options.maxPhotosPerCluster ?? DEFAULT_MAX_PHOTOS_PER_CLUSTER);

  const dated = photos.filter((photo) => timestamp(photo) !== null);
  const undated = photos.filter((photo) => timestamp(photo) === null);

  dated.sort((a, b) => (timestamp(a) as number) - (timestamp(b) as number));

  type Group = { photos: ClusterablePhoto[]; reason: ClusterSplitReason };
  const groups: Group[] = [];
  let current: Group | null = null;
  /** Last position seen, so an undated-location photo does not reset the comparison. */
  let lastPosition: { latitude: number; longitude: number } | null = null;
  let lastTime: number | null = null;

  for (const photo of dated) {
    const time = timestamp(photo) as number;
    const position = hasCoordinates(photo)
      ? { latitude: photo.latitude as number, longitude: photo.longitude as number }
      : null;

    let reason: ClusterSplitReason | null = null;
    if (!current) {
      reason = "first";
    } else if (lastTime !== null && time - lastTime > timeGapMs) {
      reason = "time_gap";
    } else if (position && lastPosition && distanceKm(lastPosition, position) > maxDistance) {
      reason = "distance";
    }

    if (reason) {
      current = { photos: [], reason };
      groups.push(current);
    }
    current!.photos.push(photo);
    lastTime = time;
    if (position) lastPosition = position;
  }

  const clusters: PhotoCluster[] = [];
  let index = 0;
  for (const group of groups) {
    // An oversized group is split by time order, and the continuation is labelled so the
    // interface can explain that the split came from the per-trace limit, not from a real
    // change of day or place.
    const parts = chunk(group.photos, maxPerCluster);
    parts.forEach((part, partIndex) => {
      clusters.push(summarise(`cluster_${++index}`, part, partIndex === 0 ? group.reason : "size_limit"));
    });
  }

  // Photos with no date stay separate. Attaching them to a dated group would hand them a
  // date they do not have, which is exactly what the fact contract forbids.
  for (const part of chunk(undated, maxPerCluster)) {
    clusters.push(summarise(`cluster_${++index}`, part, "undated"));
  }

  return clusters;
}

/** Merges two adjacent candidates, keeping photo order and re-deriving the suggestions. */
export function mergeClusters(clusters: PhotoCluster[], firstId: string, secondId: string): PhotoCluster[] {
  const firstIndex = clusters.findIndex((cluster) => cluster.id === firstId);
  const secondIndex = clusters.findIndex((cluster) => cluster.id === secondId);
  if (firstIndex === -1 || secondIndex === -1 || firstIndex === secondIndex) return clusters;

  const [lowIndex, highIndex] = firstIndex < secondIndex ? [firstIndex, secondIndex] : [secondIndex, firstIndex];
  const low = clusters[lowIndex];
  const high = clusters[highIndex];

  const merged = summarise(low.id, [...low.photos, ...high.photos], low.reason);
  const next = clusters.filter((_, i) => i !== highIndex);
  next[lowIndex] = merged;
  return next;
}

/** Removes a photo from a candidate, dropping the candidate when it becomes empty. */
export function removePhotoFromClusters(clusters: PhotoCluster[], photoId: string): PhotoCluster[] {
  return clusters
    .map((cluster) => {
      if (!cluster.photos.some((photo) => photo.id === photoId)) return cluster;
      const photos = cluster.photos.filter((photo) => photo.id !== photoId);
      return photos.length ? summarise(cluster.id, photos, cluster.reason) : null;
    })
    .filter((cluster): cluster is PhotoCluster => cluster !== null);
}

/** Whether a candidate can be merged with the next one without exceeding the trace limit. */
export function canMergeWithNext(
  clusters: PhotoCluster[],
  id: string,
  maxPhotosPerCluster = DEFAULT_MAX_PHOTOS_PER_CLUSTER,
): boolean {
  const index = clusters.findIndex((cluster) => cluster.id === id);
  if (index === -1 || index === clusters.length - 1) return false;
  return clusters[index].photos.length + clusters[index + 1].photos.length <= maxPhotosPerCluster;
}

/** Short human description of why a candidate starts where it does. */
export function describeSplitReason(reason: ClusterSplitReason): string {
  switch (reason) {
    case "time_gap":
      return "New group: a long gap since the previous photo";
    case "distance":
      return "New group: taken well away from the previous photos";
    case "size_limit":
      return "Continued: a trace holds at most 20 photos";
    case "undated":
      return "No date found in these photos";
    default:
      return "First group";
  }
}

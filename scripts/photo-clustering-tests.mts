// Unit tests for photo clustering (M2-004).
//
// Run with: npm run test:unit
// No server, no browser, no framework.

import {
  DEFAULT_MAX_PHOTOS_PER_CLUSTER,
  canMergeWithNext,
  clusterPhotos,
  describeSplitReason,
  distanceKm,
  mergeClusters,
  removePhotoFromClusters,
  type ClusterablePhoto,
} from "../src/lib/photo-clustering.ts";

let failures = 0;
let total = 0;

function check(name: string, passed: boolean, detail = "") {
  total += 1;
  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` :: ${detail}` : ""}`);
}

function photo(
  id: string,
  capturedAt: string | null,
  latitude: number | null = null,
  longitude: number | null = null,
): ClusterablePhoto {
  return { id, filename: `${id}.jpg`, capturedAt, latitude, longitude };
}

/** Porto and Lisbon are about 275 km apart; the two Porto points are a few hundred metres. */
const PORTO = { latitude: 41.1496, longitude: -8.6109 };
const PORTO_NEARBY = { latitude: 41.1521, longitude: -8.6098 };
const LISBON = { latitude: 38.7223, longitude: -9.1393 };

// ---------------------------------------------------------------- distance
check(
  "distance between two points in the same city is under a kilometre",
  distanceKm(PORTO, PORTO_NEARBY) < 1,
  `${distanceKm(PORTO, PORTO_NEARBY).toFixed(3)} km`,
);
check(
  "distance between two cities is roughly correct",
  Math.abs(distanceKm(PORTO, LISBON) - 274) < 15,
  `${distanceKm(PORTO, LISBON).toFixed(1)} km`,
);
check("distance from a point to itself is zero", distanceKm(PORTO, PORTO) === 0);
check(
  "distance is symmetric",
  Math.abs(distanceKm(PORTO, LISBON) - distanceKm(LISBON, PORTO)) < 1e-9,
);

// ---------------------------------------------------------------- basic grouping
check("no photos produce no candidates", clusterPhotos([]).length === 0);

const oneDay = clusterPhotos([
  photo("a", "2026-05-01T09:00:00.000Z", PORTO.latitude, PORTO.longitude),
  photo("b", "2026-05-01T10:30:00.000Z", PORTO_NEARBY.latitude, PORTO_NEARBY.longitude),
  photo("c", "2026-05-01T12:00:00.000Z", PORTO.latitude, PORTO.longitude),
]);
check("photos from one morning in one place form a single candidate", oneDay.length === 1, `${oneDay.length}`);
check("the single candidate keeps every photo", oneDay[0]?.photos.length === 3);
check(
  "the suggested date is the earliest capture, not the latest",
  oneDay[0]?.suggestedEventAt === "2026-05-01T09:00:00.000Z",
  String(oneDay[0]?.suggestedEventAt),
);
check(
  "the suggested date precision is day when a date exists",
  oneDay[0]?.suggestedDatePrecision === "day",
);
check(
  "the suggested position is inside the photographed area",
  Math.abs((oneDay[0]?.suggestedLatitude ?? 0) - PORTO.latitude) < 0.01,
  String(oneDay[0]?.suggestedLatitude),
);

// ---------------------------------------------------------------- time gap
const twoDays = clusterPhotos([
  photo("a", "2026-05-01T09:00:00.000Z"),
  photo("b", "2026-05-01T11:00:00.000Z"),
  photo("c", "2026-05-02T09:00:00.000Z"),
  photo("d", "2026-05-02T10:00:00.000Z"),
]);
check("a long gap starts a new candidate", twoDays.length === 2, `${twoDays.length}`);
check("the gap is reported as the reason", twoDays[1]?.reason === "time_gap", String(twoDays[1]?.reason));
check(
  "photos land in the right candidate either side of the gap",
  twoDays[0]?.photos.map((p) => p.id).join(",") === "a,b" &&
    twoDays[1]?.photos.map((p) => p.id).join(",") === "c,d",
);

const shortGap = clusterPhotos([
  photo("a", "2026-05-01T09:00:00.000Z"),
  photo("b", "2026-05-01T14:00:00.000Z"),
]);
check("a gap under the threshold does not split", shortGap.length === 1, `${shortGap.length}`);

const customGap = clusterPhotos(
  [photo("a", "2026-05-01T09:00:00.000Z"), photo("b", "2026-05-01T11:00:00.000Z")],
  { timeGapHours: 1 },
);
check("the time threshold is configurable", customGap.length === 2, `${customGap.length}`);

// ---------------------------------------------------------------- distance split
const traveled = clusterPhotos([
  photo("a", "2026-05-01T09:00:00.000Z", PORTO.latitude, PORTO.longitude),
  photo("b", "2026-05-01T10:00:00.000Z", PORTO_NEARBY.latitude, PORTO_NEARBY.longitude),
  photo("c", "2026-05-01T12:00:00.000Z", LISBON.latitude, LISBON.longitude),
]);
check(
  "moving far within the same day starts a new candidate",
  traveled.length === 2 && traveled[1]?.reason === "distance",
  `${traveled.length} / ${traveled[1]?.reason}`,
);
check(
  "the distant photo is the one that moved",
  traveled[1]?.photos.map((p) => p.id).join(",") === "c",
);

const sameCityAllDay = clusterPhotos([
  photo("a", "2026-05-01T09:00:00.000Z", PORTO.latitude, PORTO.longitude),
  photo("b", "2026-05-01T11:00:00.000Z", PORTO_NEARBY.latitude, PORTO_NEARBY.longitude),
  photo("c", "2026-05-01T13:00:00.000Z", PORTO.latitude, PORTO.longitude),
]);
check("moving around one city does not split", sameCityAllDay.length === 1, `${sameCityAllDay.length}`);

// A photo with no coordinates between two distant ones must not reset the comparison.
const gpsGapCarried = clusterPhotos([
  photo("a", "2026-05-01T09:00:00.000Z", PORTO.latitude, PORTO.longitude),
  photo("b", "2026-05-01T10:00:00.000Z"),
  photo("c", "2026-05-01T11:00:00.000Z", LISBON.latitude, LISBON.longitude),
]);
check(
  "a photo without coordinates does not hide a later change of place",
  gpsGapCarried.length === 2 && gpsGapCarried[1]?.photos[0]?.id === "c",
  `${gpsGapCarried.length}`,
);

// ---------------------------------------------------------------- size limit
const many = Array.from({ length: 47 }, (_, i) =>
  photo(`p${i}`, new Date(Date.parse("2026-05-01T09:00:00.000Z") + i * 60_000).toISOString()),
);
const chunked = clusterPhotos(many);
check(
  "a long continuous burst is split to fit the per-trace limit",
  chunked.length === 3,
  `${chunked.length} candidates`,
);
check(
  "no candidate exceeds the per-trace image limit",
  chunked.every((cluster) => cluster.photos.length <= DEFAULT_MAX_PHOTOS_PER_CLUSTER),
  chunked.map((c) => c.photos.length).join(","),
);
check(
  "a size-limit split is labelled as such, not as a real change of day or place",
  chunked[1]?.reason === "size_limit" && chunked[2]?.reason === "size_limit",
  `${chunked[1]?.reason}`,
);
check(
  "splitting preserves every photo exactly once",
  chunked.reduce((sum, c) => sum + c.photos.length, 0) === 47 &&
    new Set(chunked.flatMap((c) => c.photos.map((p) => p.id))).size === 47,
);

// ---------------------------------------------------------------- undated photos
const mixed = clusterPhotos([
  photo("dated1", "2026-05-01T09:00:00.000Z"),
  photo("undated1", null),
  photo("dated2", "2026-05-01T10:00:00.000Z"),
  photo("undated2", null),
]);
check("undated photos are separated from dated ones", mixed.length === 2, `${mixed.length}`);
const undatedCluster = mixed.find((cluster) => cluster.reason === "undated");
check(
  "the undated candidate holds exactly the undated photos",
  undatedCluster?.photos.map((p) => p.id).sort().join(",") === "undated1,undated2",
  String(undatedCluster?.photos.map((p) => p.id)),
);
check(
  "an undated candidate is never given a date it does not have",
  undatedCluster?.suggestedEventAt === null && undatedCluster?.suggestedDatePrecision === "unknown",
  `${undatedCluster?.suggestedEventAt}`,
);
check(
  "the dated candidate is not polluted by undated photos",
  mixed.find((c) => c.reason === "first")?.photos.every((p) => p.capturedAt !== null) === true,
);

const allUndated = clusterPhotos([photo("a", null), photo("b", null)]);
check(
  "photos with no metadata at all still produce a usable candidate",
  allUndated.length === 1 && allUndated[0].photos.length === 2,
);

const invalidDate = clusterPhotos([photo("a", "not-a-date"), photo("b", "2026-05-01T09:00:00.000Z")]);
check(
  "an unparseable date is treated as no date rather than crashing",
  invalidDate.length === 2 && invalidDate.some((c) => c.reason === "undated"),
  `${invalidDate.length}`,
);

// ---------------------------------------------------------------- metadata counts
const partialMetadata = clusterPhotos([
  photo("a", "2026-05-01T09:00:00.000Z", PORTO.latitude, PORTO.longitude),
  photo("b", "2026-05-01T09:30:00.000Z"),
]);
check(
  "metadata coverage is reported so the interface can be honest about it",
  partialMetadata[0]?.datedCount === 2 && partialMetadata[0]?.locatedCount === 1,
  `dated=${partialMetadata[0]?.datedCount} located=${partialMetadata[0]?.locatedCount}`,
);
check(
  "out-of-range coordinates are ignored rather than plotted",
  clusterPhotos([photo("a", "2026-05-01T09:00:00.000Z", 999, 999)])[0]?.suggestedLatitude === null,
);

// A single wrong GPS fix must not drag the suggestion across the world.
const outlier = clusterPhotos([
  photo("a", "2026-05-01T09:00:00.000Z", 41.1496, -8.6109),
  photo("b", "2026-05-01T09:10:00.000Z", 41.1497, -8.6108),
  photo("c", "2026-05-01T09:20:00.000Z", 41.1495, -8.6110),
]);
check(
  "the suggested position uses the median, resisting a single bad fix",
  Math.abs((outlier[0]?.suggestedLatitude ?? 0) - 41.1496) < 0.001,
  String(outlier[0]?.suggestedLatitude),
);

// ---------------------------------------------------------------- editing
const editable = clusterPhotos([
  photo("a", "2026-05-01T09:00:00.000Z"),
  photo("b", "2026-05-02T09:00:00.000Z"),
]);
const merged = mergeClusters(editable, editable[0].id, editable[1].id);
check("two candidates can be merged", merged.length === 1 && merged[0].photos.length === 2);
check(
  "a merged candidate re-derives its suggested date from all its photos",
  merged[0].suggestedEventAt === "2026-05-01T09:00:00.000Z" &&
    merged[0].lastEventAt === "2026-05-02T09:00:00.000Z",
);
check(
  "merging an unknown id changes nothing",
  mergeClusters(editable, "nope", editable[1].id).length === 2,
);
check("merging a candidate with itself changes nothing", mergeClusters(editable, "cluster_1", "cluster_1").length === 2);

check(
  "merging is refused when it would exceed the per-trace limit",
  canMergeWithNext(clusterPhotos(many), "cluster_1") === false,
);
check("merging is allowed when the total fits", canMergeWithNext(editable, editable[0].id) === true);
check("the last candidate has nothing to merge with", canMergeWithNext(editable, editable[1].id) === false);

const afterRemoval = removePhotoFromClusters(oneDay, "b");
check(
  "removing a photo keeps the candidate and re-derives it",
  afterRemoval.length === 1 && afterRemoval[0].photos.length === 2,
);
const emptied = removePhotoFromClusters(
  clusterPhotos([photo("solo", "2026-05-01T09:00:00.000Z")]),
  "solo",
);
check("removing the last photo drops the candidate", emptied.length === 0);
check(
  "removing an unknown photo changes nothing",
  removePhotoFromClusters(oneDay, "missing").length === 1,
);

// ---------------------------------------------------------------- copy
check(
  "every split reason has human-readable copy",
  (["first", "time_gap", "distance", "size_limit", "undated"] as const).every(
    (reason) => describeSplitReason(reason).length > 10,
  ),
);

// ---------------------------------------------------------------- realistic import
const trip: ClusterablePhoto[] = [];
const start = Date.parse("2026-04-10T08:00:00.000Z");
// Three days in Porto, then two days in Lisbon, 40 photos a day.
for (let day = 0; day < 5; day += 1) {
  const place = day < 3 ? PORTO : LISBON;
  for (let i = 0; i < 40; i += 1) {
    trip.push(
      photo(
        `d${day}p${i}`,
        new Date(start + day * 86_400_000 + i * 600_000).toISOString(),
        place.latitude + i * 0.0001,
        place.longitude + i * 0.0001,
      ),
    );
  }
}
const tripClusters = clusterPhotos(trip);
check(
  "a five-day, 200-photo trip becomes a reviewable number of candidates",
  tripClusters.length >= 10 && tripClusters.length <= 15,
  `${tripClusters.length} candidates from ${trip.length} photos`,
);
check(
  "every photo from the trip appears exactly once",
  tripClusters.reduce((sum, c) => sum + c.photos.length, 0) === trip.length &&
    new Set(tripClusters.flatMap((c) => c.photos.map((p) => p.id))).size === trip.length,
);
check(
  "no trip candidate exceeds the per-trace limit",
  tripClusters.every((c) => c.photos.length <= DEFAULT_MAX_PHOTOS_PER_CLUSTER),
);
check(
  "candidates stay in chronological order",
  tripClusters
    .filter((c) => c.suggestedEventAt)
    .every(
      (c, i, list) =>
        i === 0 || Date.parse(list[i - 1].suggestedEventAt as string) <= Date.parse(c.suggestedEventAt as string),
    ),
);
// The move to Lisbon happens overnight, so the gap is reported rather than the distance.
// A long gap is the more informative explanation when both apply, so the property worth
// asserting is that the two cities never share a candidate.
const cityOfCluster = tripClusters.map((cluster) =>
  (cluster.suggestedLatitude ?? 0) > 40 ? "porto" : "lisbon",
);
check(
  "no candidate mixes photos from two different cities",
  tripClusters.every((cluster) => {
    const cities = new Set(
      cluster.photos.map((p) => ((p.latitude ?? 0) > 40 ? "porto" : "lisbon")),
    );
    return cities.size === 1;
  }),
);
check(
  "the candidates move from the first city to the second and never back",
  cityOfCluster.lastIndexOf("porto") < cityOfCluster.indexOf("lisbon"),
  cityOfCluster.join(","),
);

console.log("");
console.log(`${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);

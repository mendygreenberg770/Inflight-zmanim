/**
 * In-flight zmanim engine.
 *
 * A zman "occurs" in flight at the instant t where the zman computed for the
 * aircraft's current position equals the current time:  Z(pos(t)) = t.
 * We sample the flight path every STEP minutes, evaluate f(t) = Z(pos(t)) - t
 * (using whichever solar day's zman is nearest to t), and detect sign changes.
 *
 * Paths are either great-circle approximations or actual recorded flightpaths
 * (like MyZmanim, which computes across the most recent real flightpaths).
 */

import { gcDistanceKm, gcIntermediate, LatLon } from "./greatCircle";
import { DayZmanim, PathEventKey, RowKey, ZmanKey, zmanimForDay } from "./zmanim";

const STEP_MS = 60_000; // 1-minute sampling
const DAY_MS = 86_400_000;
/** A genuine crossing has |f| near 0 on both sides; date-candidate jumps are ~hours. */
const CROSSING_WINDOW_MS = 90 * 60_000;

export const ARCTIC_LAT = 66.5622;
/** Halachic Date Line per R' Tukachinsky: the meridian opposite Jerusalem (~145°W). */
export const DATE_LINE_EAST_LON = -144.77;
/** Halachic Date Line per the Chazon Ish: 90° east of Jerusalem (~125°E). */
export const DATE_LINE_WEST_LON = 125.23;

// ── Flight paths ─────────────────────────────────────────────────────────────

export interface PathPoint {
  /** Fraction of flight elapsed, 0 = takeoff, 1 = landing (strictly increasing). */
  frac: number;
  lat: number;
  lon: number;
}

export interface FlightPath {
  points: PathPoint[];
  durationMs: number;
  /** e.g. "great-circle", "great-circle -6%", or a recorded flight's date. */
  label: string;
}

/** Great-circle path sampled densely enough that linear interpolation is exact to <1 km. */
export function gcPath(from: LatLon, to: LatLon, durationMs: number, label = "great-circle"): FlightPath {
  const N = 150;
  const points: PathPoint[] = [];
  for (let i = 0; i <= N; i++) {
    const frac = i / N;
    const p = gcIntermediate(from, to, frac);
    points.push({ frac, lat: p.lat, lon: p.lon });
  }
  return { points, durationMs, label };
}

/** Position along a path at elapsed-fraction f (linear interp, antimeridian-safe). */
export function positionAt(path: FlightPath, frac: number): LatLon {
  const pts = path.points;
  if (frac <= pts[0].frac) return { lat: pts[0].lat, lon: pts[0].lon };
  const last = pts[pts.length - 1];
  if (frac >= last.frac) return { lat: last.lat, lon: last.lon };

  // Binary search for the segment containing frac
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].frac <= frac) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const w = (frac - a.frac) / (b.frac - a.frac);

  let dlon = b.lon - a.lon;
  if (dlon > 180) dlon -= 360;
  if (dlon < -180) dlon += 360;
  let lon = a.lon + w * dlon;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;

  return { lat: a.lat + w * (b.lat - a.lat), lon };
}

export interface Scenario {
  takeoffMs: number;
  path: FlightPath;
}

interface PathSample {
  t: number;
  pos: LatLon;
  frac: number;
}

function buildSamples(s: Scenario): PathSample[] {
  const steps = Math.max(2, Math.ceil(s.path.durationMs / STEP_MS));
  const samples: PathSample[] = [];
  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    samples.push({
      t: s.takeoffMs + frac * s.path.durationMs,
      pos: positionAt(s.path, frac),
      frac,
    });
  }
  return samples;
}

// ── Zman crossings ───────────────────────────────────────────────────────────

export interface Crossing {
  key: RowKey;
  timeMs: number;
  /** Fraction of flight elapsed when the event occurs (0..1). */
  progress: number;
}

/** Zman candidate for day of t and its neighbors; returns the one nearest to t. */
function nearestZman(
  zman: ZmanKey,
  t: number,
  pos: LatLon,
  cache: Map<string, DayZmanim>
): number | null {
  const day0 = Math.floor(t / DAY_MS) * DAY_MS;
  let best: number | null = null;
  for (const day of [day0 - DAY_MS, day0, day0 + DAY_MS]) {
    const key = `${day}|${pos.lat.toFixed(4)}|${pos.lon.toFixed(4)}`;
    let z = cache.get(key);
    if (!z) {
      z = zmanimForDay(day, pos.lat, pos.lon);
      cache.set(key, z);
    }
    const v = z[zman];
    if (v != null && (best == null || Math.abs(v - t) < Math.abs(best - t))) {
      best = v;
    }
  }
  return best;
}

/** All in-flight occurrences of the requested zmanim for one flight scenario. */
export function scenarioCrossings(s: Scenario, zmanim: ZmanKey[]): Crossing[] {
  const samples = buildSamples(s);
  const cache = new Map<string, DayZmanim>();
  const crossings: Crossing[] = [];

  for (const zman of zmanim) {
    let prevF: number | null = null;
    let prevT = 0;
    let prevFrac = 0;

    for (const sample of samples) {
      const z = nearestZman(zman, sample.t, sample.pos, cache);
      const f = z == null ? null : z - sample.t;

      if (
        f != null &&
        prevF != null &&
        ((prevF >= 0 && f < 0) || (prevF < 0 && f >= 0)) &&
        Math.abs(prevF) < CROSSING_WINDOW_MS &&
        Math.abs(f) < CROSSING_WINDOW_MS
      ) {
        // Linear interpolation to f = 0
        const w = prevF / (prevF - f);
        crossings.push({
          key: zman,
          timeMs: Math.round(prevT + w * (sample.t - prevT)),
          progress: prevFrac + w * (sample.frac - prevFrac),
        });
      }
      prevF = f;
      prevT = sample.t;
      prevFrac = sample.frac;
    }
  }
  return crossings;
}

// ── Path events: Arctic circle & halachic date lines ────────────────────────

/** Signed angular difference lon - target, wrapped to (-180, 180]. */
function lonDelta(lon: number, target: number): number {
  let d = lon - target;
  while (d <= -180) d += 360;
  while (d > 180) d -= 360;
  return d;
}

/**
 * Enter/Exit Arctic and halachic date-line crossings along a scenario
 * (MyZmanim shows the same events). A path may cross a line more than once —
 * every crossing is reported.
 */
export function pathEvents(s: Scenario): Crossing[] {
  const samples = buildSamples(s);
  const events: Crossing[] = [];

  const push = (key: PathEventKey, prev: PathSample, cur: PathSample, w: number) => {
    events.push({
      key,
      timeMs: Math.round(prev.t + w * (cur.t - prev.t)),
      progress: prev.frac + w * (cur.frac - prev.frac),
    });
  };

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const cur = samples[i];

    // Arctic circle (|lat| >= 66.56°)
    const prevIn = Math.abs(prev.pos.lat) >= ARCTIC_LAT;
    const curIn = Math.abs(cur.pos.lat) >= ARCTIC_LAT;
    if (prevIn !== curIn) {
      const w =
        (ARCTIC_LAT - Math.abs(prev.pos.lat)) /
        (Math.abs(cur.pos.lat) - Math.abs(prev.pos.lat));
      push(curIn ? "arcticEnter" : "arcticExit", prev, cur, Math.min(1, Math.max(0, w)));
    }

    // Halachic date lines (meridian crossings, antimeridian-safe)
    for (const line of [
      { key: "dateLineEast" as const, lon: DATE_LINE_EAST_LON },
      { key: "dateLineWest" as const, lon: DATE_LINE_WEST_LON },
    ]) {
      const d1 = lonDelta(prev.pos.lon, line.lon);
      const d2 = lonDelta(cur.pos.lon, line.lon);
      // Genuine crossing: sign change while near the meridian (a plane moves
      // <1° of longitude per minute-step; jumps of ~360° are wraps, not crossings)
      if (d1 * d2 < 0 && Math.abs(d1) < 90 && Math.abs(d2) < 90) {
        push(line.key, prev, cur, d1 / (d1 - d2));
      }
    }
  }
  return events;
}

/** All rows for a scenario: zman crossings + path events. */
export function scenarioRows(s: Scenario, zmanim: ZmanKey[]): Crossing[] {
  return [...scenarioCrossings(s, zmanim), ...pathEvents(s)];
}

// ── Chart (tile) generation ──────────────────────────────────────────────────

export interface ZmanRange {
  key: RowKey;
  earliestMs: number;
  latestMs: number;
  /** True when the event occurred in only some scenarios — treat with caution. */
  uncertain: boolean;
}

export interface Tile {
  windowStartMs: number;
  windowEndMs: number;
  landingEarliestMs: number;
  landingLatestMs: number;
  ranges: ZmanRange[];
}

/**
 * MyZmanim-style tiles: the takeoff window is split into buckets; for each
 * bucket we compute zmanim + path events for takeoff at both bucket edges
 * across every supplied flight path, and report the min–max envelope.
 */
export function buildTiles(opts: {
  paths: FlightPath[];
  windowStartMs: number;
  windowMinutes: number;
  bucketMinutes: number;
  zmanim: ZmanKey[];
}): Tile[] {
  const bucketMs = opts.bucketMinutes * 60_000;
  const nBuckets = Math.max(1, Math.round(opts.windowMinutes / opts.bucketMinutes));
  const durations = opts.paths.map((p) => p.durationMs);
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);

  // Rows for every bucket edge × path (edges are shared between buckets)
  const edgeResults: Crossing[][][] = []; // [edge][pathIdx] -> rows
  for (let e = 0; e <= nBuckets; e++) {
    const takeoffMs = opts.windowStartMs + e * bucketMs;
    edgeResults.push(
      opts.paths.map((path) => scenarioRows({ takeoffMs, path }, opts.zmanim))
    );
  }

  const allKeys: RowKey[] = [
    ...opts.zmanim,
    "arcticEnter",
    "arcticExit",
    "dateLineEast",
    "dateLineWest",
  ];

  const tiles: Tile[] = [];
  for (let b = 0; b < nBuckets; b++) {
    const scenarios = [...edgeResults[b], ...edgeResults[b + 1]];
    const ranges: ZmanRange[] = [];

    for (const key of allKeys) {
      // Cluster each scenario's occurrences of this row together; an event can
      // occur more than once — clusters > 6h apart are separate events.
      const all: number[] = [];
      let scenariosWithKey = 0;
      for (const rows of scenarios) {
        const times = rows.filter((c) => c.key === key).map((c) => c.timeMs);
        if (times.length > 0) scenariosWithKey++;
        all.push(...times);
      }
      if (all.length === 0) continue;
      all.sort((a, b2) => a - b2);

      let clusterStart = 0;
      for (let i = 1; i <= all.length; i++) {
        if (i === all.length || all[i] - all[i - 1] > 6 * 3600_000) {
          ranges.push({
            key,
            earliestMs: all[clusterStart],
            latestMs: all[i - 1],
            uncertain: scenariosWithKey < scenarios.length,
          });
          clusterStart = i;
        }
      }
    }

    ranges.sort((a, b2) => (a.earliestMs + a.latestMs) / 2 - (b2.earliestMs + b2.latestMs) / 2);

    const windowStartMs = opts.windowStartMs + b * bucketMs;
    const windowEndMs = windowStartMs + bucketMs;
    tiles.push({
      windowStartMs,
      windowEndMs,
      landingEarliestMs: windowStartMs + minDuration,
      landingLatestMs: windowEndMs + maxDuration,
      ranges,
    });
  }
  return tiles;
}

// ── Exact-takeoff point estimates ────────────────────────────────────────────

export interface ExactCrossing {
  key: RowKey;
  /** Best estimate, computed with the nominal (median-duration) path. */
  nominalMs: number;
  /** Envelope across all paths. */
  earliestMs: number;
  latestMs: number;
  /** Time into the flight at the nominal estimate. */
  elapsedMs: number;
}

/**
 * Point-estimate zmanim for a single known takeoff time: one nominal time per
 * occurrence (median-duration path), plus an earliest/latest envelope across
 * all supplied paths.
 */
export function exactCrossings(opts: {
  paths: FlightPath[];
  takeoffMs: number;
  zmanim: ZmanKey[];
}): { crossings: ExactCrossing[]; nominalPath: FlightPath } {
  const sorted = [...opts.paths].sort((a, b) => a.durationMs - b.durationMs);
  const nominalPath = sorted[Math.floor(sorted.length / 2)];

  const nominal = scenarioRows({ takeoffMs: opts.takeoffMs, path: nominalPath }, opts.zmanim);
  const others = opts.paths
    .filter((p) => p !== nominalPath)
    .map((path) => scenarioRows({ takeoffMs: opts.takeoffMs, path }, opts.zmanim));

  const crossings: ExactCrossing[] = nominal.map((c) => {
    const near = others.flatMap((rows) =>
      rows
        .filter((x) => x.key === c.key && Math.abs(x.timeMs - c.timeMs) < 3 * 3600_000)
        .map((x) => x.timeMs)
    );
    const all = [c.timeMs, ...near];
    return {
      key: c.key,
      nominalMs: c.timeMs,
      earliestMs: Math.min(...all),
      latestMs: Math.max(...all),
      elapsedMs: Math.round(c.progress * nominalPath.durationMs),
    };
  });
  crossings.sort((a, b) => a.nominalMs - b.nominalMs);
  return { crossings, nominalPath };
}

/** Rough airtime estimate from great-circle distance, with a jet-stream east/west bias. */
export function estimateDurationMs(from: LatLon, to: LatLon): number {
  const km = gcDistanceKm(from, to);
  const nm = km * 0.539957;
  // Eastbound flights ride the jet stream; westbound fight it.
  const lonDiff = ((to.lon - from.lon + 540) % 360) - 180;
  const eastbound = lonDiff > 0;
  const windKt = 40 * Math.sin(Math.abs(lonDiff) * Math.PI / 180 / 2) * (eastbound ? 1 : -1);
  const groundSpeedKt = 460 + windKt;
  const hours = nm / groundSpeedKt + 0.35; // climb/descent allowance
  return Math.round(hours * 3600_000);
}

/** Great-circle path set with ±spread duration variants (fallback when no real tracks). */
export function gcPathSet(
  from: LatLon,
  to: LatLon,
  durationMs: number,
  spread = 0.06
): FlightPath[] {
  return [
    gcPath(from, to, Math.round(durationMs * (1 - spread)), `great-circle -${spread * 100}%`),
    gcPath(from, to, durationMs, "great-circle"),
    gcPath(from, to, Math.round(durationMs * (1 + spread)), `great-circle +${spread * 100}%`),
  ];
}

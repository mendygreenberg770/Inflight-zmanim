/**
 * In-flight zmanim engine.
 *
 * A zman "occurs" in flight at the instant t where the zman computed for the
 * aircraft's current position equals the current time:  Z(pos(t)) = t.
 * We sample the flight path every STEP minutes, evaluate f(t) = Z(pos(t)) - t
 * (using whichever solar day's zman is nearest to t), and detect sign changes.
 */

import { gcDistanceKm, gcIntermediate, LatLon } from "./greatCircle";
import { DayZmanim, ZmanKey, zmanimForDay } from "./zmanim";

const STEP_MS = 60_000; // 1-minute sampling
const DAY_MS = 86_400_000;
/** A genuine crossing has |f| near 0 on both sides; date-candidate jumps are ~hours. */
const CROSSING_WINDOW_MS = 90 * 60_000;

export const ARCTIC_LAT = 66.5622;

export interface Scenario {
  takeoffMs: number;
  durationMs: number;
  from: LatLon;
  to: LatLon;
}

export interface Crossing {
  zman: ZmanKey;
  timeMs: number;
  /** Fraction of flight elapsed when the zman occurs (0..1). */
  progress: number;
}

interface PathSample {
  t: number;
  pos: LatLon;
  frac: number;
}

function buildPath(s: Scenario): PathSample[] {
  const steps = Math.max(2, Math.ceil(s.durationMs / STEP_MS));
  const samples: PathSample[] = [];
  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    samples.push({
      t: s.takeoffMs + frac * s.durationMs,
      pos: gcIntermediate(s.from, s.to, frac),
      frac,
    });
  }
  return samples;
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
    // Cache key rounds position: within one sample step the plane moves < 20km,
    // but we key on the exact sample anyway since each sample is visited once per zman.
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
  const path = buildPath(s);
  const cache = new Map<string, DayZmanim>();
  const crossings: Crossing[] = [];

  for (const zman of zmanim) {
    let prevF: number | null = null;
    let prevT = 0;
    let prevFrac = 0;

    for (const sample of path) {
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
          zman,
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

/** Times at which the path enters/exits the Arctic circle (|lat| >= 66.56°). */
export function arcticCrossings(s: Scenario): { enter: number | null; exit: number | null } {
  const path = buildPath(s);
  let enter: number | null = null;
  let exit: number | null = null;
  let prevIn = Math.abs(path[0].pos.lat) >= ARCTIC_LAT;
  if (prevIn) enter = path[0].t;
  for (const sample of path) {
    const inArctic = Math.abs(sample.pos.lat) >= ARCTIC_LAT;
    if (inArctic && !prevIn && enter == null) enter = sample.t;
    if (!inArctic && prevIn) exit = sample.t;
    prevIn = inArctic;
  }
  return { enter, exit };
}

// ── Chart (tile) generation ──────────────────────────────────────────────────

export interface ZmanRange {
  zman: ZmanKey;
  earliestMs: number;
  latestMs: number;
  /** True when the zman occurred in only some scenarios — treat with caution. */
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
 * bucket we compute zmanim for takeoff at both bucket edges with fast/slow
 * flight durations, and report the min–max envelope for each zman.
 */
export function buildTiles(opts: {
  from: LatLon;
  to: LatLon;
  windowStartMs: number;
  windowMinutes: number;
  bucketMinutes: number;
  durationMs: number;
  durationSpread?: number; // fractional, default ±6%
  zmanim: ZmanKey[];
}): Tile[] {
  const spread = opts.durationSpread ?? 0.06;
  const durations = [
    Math.round(opts.durationMs * (1 - spread)),
    opts.durationMs,
    Math.round(opts.durationMs * (1 + spread)),
  ];
  const bucketMs = opts.bucketMinutes * 60_000;
  const nBuckets = Math.max(1, Math.round(opts.windowMinutes / opts.bucketMinutes));

  // Crossings for every bucket edge × duration (edges are shared between buckets)
  const edgeResults: Crossing[][][] = []; // [edge][durationIdx] -> crossings
  for (let e = 0; e <= nBuckets; e++) {
    const takeoffMs = opts.windowStartMs + e * bucketMs;
    edgeResults.push(
      durations.map((durationMs) =>
        scenarioCrossings(
          { takeoffMs, durationMs, from: opts.from, to: opts.to },
          opts.zmanim
        )
      )
    );
  }

  const tiles: Tile[] = [];
  for (let b = 0; b < nBuckets; b++) {
    const scenarios = [...edgeResults[b], ...edgeResults[b + 1]];
    const ranges: ZmanRange[] = [];

    for (const zman of opts.zmanim) {
      // Cluster each scenario's occurrences of this zman together; a zman can
      // occur more than once (westbound "sunset chasing") — clusters > 6h apart
      // are treated as separate events.
      const all: number[] = [];
      let scenariosWithZman = 0;
      for (const crossings of scenarios) {
        const times = crossings.filter((c) => c.zman === zman).map((c) => c.timeMs);
        if (times.length > 0) scenariosWithZman++;
        all.push(...times);
      }
      if (all.length === 0) continue;
      all.sort((a, b2) => a - b2);

      let clusterStart = 0;
      for (let i = 1; i <= all.length; i++) {
        if (i === all.length || all[i] - all[i - 1] > 6 * 3600_000) {
          ranges.push({
            zman,
            earliestMs: all[clusterStart],
            latestMs: all[i - 1],
            uncertain: scenariosWithZman < scenarios.length,
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
      landingEarliestMs: windowStartMs + durations[0],
      landingLatestMs: windowEndMs + durations[durations.length - 1],
      ranges,
    });
  }
  return tiles;
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

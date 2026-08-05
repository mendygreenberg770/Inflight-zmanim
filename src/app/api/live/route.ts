import { NextRequest, NextResponse } from "next/server";
import { Airport, findAirport } from "@/lib/airports";
import { scenarioCrossings, Scenario } from "@/lib/flightEngine";
import {
  crossTrackKm,
  gcDestination,
  gcDistanceKm,
  gcIntermediate,
  initialBearing,
  LatLon,
} from "@/lib/greatCircle";
import {
  fetchFlightAware,
  fetchLivePosition,
  fetchRoute,
  LivePosition,
  RouteInfo,
} from "@/lib/liveProviders";
import { solarElevation } from "@/lib/solar";
import { DEFAULT_ZMANIM, ZmanKey } from "@/lib/zmanim";

export const dynamic = "force-dynamic";

const LIVE_ZMANIM: ZmanKey[] = [...DEFAULT_ZMANIM, "tzeis72"];

function resolveAirport(iata?: string, icao?: string): Airport | undefined {
  return (iata && findAirport(iata)) || (icao && findAirport(icao)) || undefined;
}

interface LiveCrossing {
  zman: ZmanKey;
  earliestMs: number;
  nominalMs: number;
  latestMs: number;
}

/** Demo mode: ?sim=1&from=EWR&to=BRU&progress=0.4 fakes a position mid-route. */
function simulatedPosition(p: URLSearchParams): LivePosition | null {
  const from = findAirport(p.get("from") ?? "");
  const to = findAirport(p.get("to") ?? "");
  if (!from || !to) return null;
  const progress = Math.min(0.98, Math.max(0, Number(p.get("progress") ?? 0.35)));
  const pos = gcIntermediate({ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon }, progress);
  return {
    callsign: (p.get("flight") ?? "SIM") + " (simulated)",
    lat: pos.lat,
    lon: pos.lon,
    altitude: 37000,
    groundSpeedKt: 480,
    track: null,
    source: "simulation",
    timestampMs: Date.now(),
  };
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const flight = (p.get("flight") ?? "").trim();
  if (!flight && !p.get("sim")) {
    return NextResponse.json({ error: "flight parameter is required" }, { status: 400 });
  }

  let position: LivePosition | null = null;
  let route: RouteInfo | null = null;
  let fa: Awaited<ReturnType<typeof fetchFlightAware>> = null;

  if (p.get("sim")) {
    position = simulatedPosition(p);
    if (!position) {
      return NextResponse.json(
        { error: "sim mode requires valid from and to airport codes" },
        { status: 400 }
      );
    }
  } else {
    // 1. FlightAware (if configured), then free ADS-B providers
    fa = await fetchFlightAware(flight);
    position = fa?.position ?? null;
    route = fa?.route ?? null;

    if (!position) position = await fetchLivePosition(flight);
    if (!route?.destIata && !route?.destIcao) {
      // Pass the live position so the route lookup can be plausibility-checked
      route =
        (await fetchRoute(flight, position ? { lat: position.lat, lon: position.lon } : undefined)) ??
        route;
    }
  }

  // Manual overrides always win
  const fromOverride = p.get("from");
  const destOverride = p.get("to");
  const origin = fromOverride
    ? findAirport(fromOverride)
    : resolveAirport(route?.originIata, route?.originIcao);
  const dest = destOverride
    ? findAirport(destOverride)
    : resolveAirport(route?.destIata, route?.destIcao);
  if (destOverride && !dest) {
    return NextResponse.json({ error: `Unknown airport code "${destOverride}"` }, { status: 400 });
  }

  if (!position) {
    return NextResponse.json({
      error: "no_position",
      message:
        "No live position found for this flight. It may not be airborne yet, may be out of ADS-B coverage, or the callsign may differ from the flight number.",
      route: route
        ? {
            from: resolveAirport(route.originIata, route.originIcao) ?? null,
            to: resolveAirport(route.destIata, route.destIcao) ?? null,
            source: route.source,
          }
        : null,
    });
  }

  const now = Date.now();
  const pos: LatLon = { lat: position.lat, lon: position.lon };
  const gsKt = position.groundSpeedKt && position.groundSpeedKt > 60 ? position.groundSpeedKt : 460;
  const kmPerMs = (gsKt * 1.852) / 3600_000;

  // Sanity-check community route data against the live position: the aircraft
  // should be near the origin→destination great circle and (when moving)
  // heading broadly toward the destination. Reused flight numbers make stale
  // routes common — better to warn than to compute zmanim toward the wrong city.
  let routeSuspect = false;
  const suspectReasons: string[] = [];
  if (dest && !destOverride && !p.get("sim")) {
    const destLL = { lat: dest.lat, lon: dest.lon };
    if (origin) {
      const originLL = { lat: origin.lat, lon: origin.lon };
      const xtKm = Math.abs(crossTrackKm(pos, originLL, destLL));
      if (xtKm > 500) {
        routeSuspect = true;
        suspectReasons.push(
          `the aircraft is ${Math.round(xtKm)} km off the ${origin.iata}→${dest.iata} route`
        );
      }
    }
    if (position.track != null && gsKt > 200) {
      const bearingToDest = initialBearing(pos, destLL);
      const diff = Math.abs(((position.track - bearingToDest + 540) % 360) - 180);
      if (diff > 120 && gcDistanceKm(pos, destLL) > 300) {
        routeSuspect = true;
        suspectReasons.push(
          `it is heading ${Math.round(position.track)}° while ${dest.iata} is at bearing ${Math.round(bearingToDest)}°`
        );
      }
    }
  }

  // 2. Forward path: to the destination if known, else project along current track
  let target: LatLon;
  let destKnown = true;
  if (dest) {
    target = { lat: dest.lat, lon: dest.lon };
  } else {
    destKnown = false;
    const track = position.track ?? 90;
    target = gcDestination(pos, track, kmPerMs * 5 * 3600_000); // 5h projection
  }

  const remainingKm = gcDistanceKm(pos, target);
  let remainingMs = remainingKm / kmPerMs;
  if (fa?.estimatedOnMs && fa.estimatedOnMs > now) {
    remainingMs = fa.estimatedOnMs - now;
  }
  const etaMs = now + remainingMs;

  // 3. Zman crossings ahead, with a ±7% speed envelope
  const mkScenario = (duration: number): Scenario => ({
    takeoffMs: now,
    durationMs: Math.max(60_000, Math.round(duration)),
    from: pos,
    to: target,
  });
  const scenarios = [remainingMs / 1.07, remainingMs, remainingMs * 1.07].map((d) =>
    scenarioCrossings(mkScenario(d), LIVE_ZMANIM)
  );

  const crossings: LiveCrossing[] = [];
  for (const zman of LIVE_ZMANIM) {
    const nominalTimes = scenarios[1].filter((c) => c.zman === zman).map((c) => c.timeMs);
    for (const nominal of nominalTimes) {
      const nearBy = (list: { zman: ZmanKey; timeMs: number }[]) => {
        const times = list
          .filter((c) => c.zman === zman)
          .map((c) => c.timeMs)
          .filter((t) => Math.abs(t - nominal) < 3 * 3600_000);
        return times.length ? times : [nominal];
      };
      const all = [...nearBy(scenarios[0]), nominal, ...nearBy(scenarios[2])];
      crossings.push({
        zman,
        earliestMs: Math.min(...all),
        nominalMs: nominal,
        latestMs: Math.max(...all),
      });
    }
  }
  crossings.sort((a, b) => a.nominalMs - b.nominalMs);

  // 4. Sun-elevation timeline for the client chart (every 5 min to landing)
  const timeline: { t: number; elev: number; lat: number; lon: number }[] = [];
  const steps = Math.max(2, Math.min(200, Math.ceil(remainingMs / 300_000)));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const pt = gcIntermediate(pos, target, f);
    const t = now + f * remainingMs;
    timeline.push({
      t,
      elev: Math.round(solarElevation(t, pt.lat, pt.lon) * 10) / 10,
      lat: Math.round(pt.lat * 100) / 100,
      lon: Math.round(pt.lon * 100) / 100,
    });
  }

  return NextResponse.json({
    flight: {
      input: flight,
      callsign: position.callsign,
      hex: position.hex ?? null,
      aircraftType: position.aircraftType ?? null,
      source: position.source,
      positionTimestampMs: position.timestampMs,
      lat: position.lat,
      lon: position.lon,
      altitudeFt: position.altitude,
      groundSpeedKt: position.groundSpeedKt,
      track: position.track,
    },
    route: {
      from: origin ?? null,
      to: dest ?? null,
      destKnown,
      source: route?.source ?? (fromOverride || destOverride ? "manual" : null),
      suspect: routeSuspect,
      suspectMessage: routeSuspect
        ? `The route from the flight database (${origin ? origin.iata + " → " : ""}${dest?.iata}) doesn't match the aircraft: ${suspectReasons.join(", and ")}. Flight-number route databases are community-maintained and often stale — set the origin/destination overrides to correct it.`
        : null,
    },
    nowMs: now,
    etaMs: destKnown ? etaMs : null,
    remainingKm: destKnown ? Math.round(remainingKm) : null,
    sunElevationNow: Math.round(solarElevation(now, pos.lat, pos.lon) * 10) / 10,
    crossings,
    timeline,
  });
}

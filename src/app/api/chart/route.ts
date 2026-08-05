import { NextRequest, NextResponse } from "next/server";
import { findAirport } from "@/lib/airports";
import {
  buildTiles,
  estimateDurationMs,
  FlightPath,
  gcPathSet,
} from "@/lib/flightEngine";
import { gcDistanceKm, initialBearing } from "@/lib/greatCircle";
import { fetchRecentTracks } from "@/lib/liveProviders";
import { isDst, zonedTimeToUtc } from "@/lib/tz";
import { DEFAULT_ZMANIM, ZMAN_DEFS, ZmanKey } from "@/lib/zmanim";

export const dynamic = "force-dynamic";

const VALID_KEYS = new Set(ZMAN_DEFS.map((z) => z.key));

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  const from = findAirport(p.get("from") ?? "");
  const to = findAirport(p.get("to") ?? "");
  if (!from || !to) {
    return NextResponse.json(
      { error: "Unknown origin or destination airport code" },
      { status: 400 }
    );
  }

  const dateStr = p.get("date"); // YYYY-MM-DD, origin-local
  const startStr = p.get("start"); // HH:mm, origin-local
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !startStr || !/^\d{1,2}:\d{2}$/.test(startStr)) {
    return NextResponse.json(
      { error: "date (YYYY-MM-DD) and start (HH:mm) are required" },
      { status: 400 }
    );
  }
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [hh, mm] = startStr.split(":").map(Number);
  const windowStartMs = zonedTimeToUtc(from.tz, y, mo, d, hh, mm);

  const windowMinutes = Math.min(720, Math.max(10, Number(p.get("windowMinutes") ?? 180)));
  const bucketMinutes = Math.min(60, Math.max(5, Number(p.get("bucketMinutes") ?? 10)));

  const fromLL = { lat: from.lat, lon: from.lon };
  const toLL = { lat: to.lat, lon: to.lon };
  const estimatedMs = estimateDurationMs(fromLL, toLL);
  const durationMinutes = Number(p.get("durationMinutes"));
  const durationMs =
    durationMinutes > 30 && durationMinutes < 1500 ? durationMinutes * 60_000 : estimatedMs;

  let zmanim: ZmanKey[] = DEFAULT_ZMANIM;
  const zParam = p.get("zmanim");
  if (zParam) {
    const requested = zParam.split(",").filter((k): k is ZmanKey => VALID_KEYS.has(k as ZmanKey));
    if (requested.length > 0) zmanim = requested;
  }

  // Prefer actual recorded flightpaths of this flight number (the MyZmanim
  // approach: compute across the most recent real tracks); fall back to a
  // great-circle set with fast/slow variants when no tracks are available.
  const flightIdent = (p.get("flight") ?? "").trim();
  let paths: FlightPath[] = [];
  let pathSource: { type: "historical" | "greatCircle"; count: number; flight?: string } = {
    type: "greatCircle",
    count: 3,
  };
  if (flightIdent) {
    const tracks = await fetchRecentTracks(flightIdent, {
      fromCodes: [from.iata, from.icao],
      toCodes: [to.iata, to.icao],
    });
    if (tracks.length >= 2) {
      paths = tracks;
      pathSource = { type: "historical", count: tracks.length, flight: flightIdent };
    }
  }
  if (paths.length === 0) {
    paths = gcPathSet(fromLL, toLL, durationMs);
  }

  const tiles = buildTiles({
    paths,
    windowStartMs,
    windowMinutes,
    bucketMinutes,
    zmanim,
  });

  // For display: median of the path durations actually used
  const sortedDurations = paths.map((x) => x.durationMs).sort((a, b) => a - b);
  const usedDurationMs = sortedDurations[Math.floor(sortedDurations.length / 2)];

  const km = gcDistanceKm(fromLL, toLL);
  const bearing = initialBearing(fromLL, toLL);
  const lonDiff = ((to.lon - from.lon + 540) % 360) - 180;

  return NextResponse.json({
    meta: {
      from,
      to,
      distanceKm: Math.round(km),
      distanceMi: Math.round(km * 0.621371),
      bearing: Math.round(bearing),
      direction: Math.abs(lonDiff) < 15 ? (to.lat > from.lat ? "Northbound" : "Southbound") : lonDiff > 0 ? "Eastbound" : "Westbound",
      timezone: from.tz,
      dst: isDst(from.tz, windowStartMs),
      windowStartMs,
      windowMinutes,
      bucketMinutes,
      durationMs: usedDurationMs,
      durationEstimated:
        pathSource.type === "greatCircle" && !(durationMinutes > 30 && durationMinutes < 1500),
      estimatedDurationMs: estimatedMs,
      zmanim,
      pathSource,
    },
    tiles,
  });
}

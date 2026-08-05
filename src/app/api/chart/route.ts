import { NextRequest, NextResponse } from "next/server";
import { findAirport } from "@/lib/airports";
import {
  arcticCrossings,
  buildTiles,
  estimateDurationMs,
} from "@/lib/flightEngine";
import { gcDistanceKm, initialBearing } from "@/lib/greatCircle";
import { isDst, zonedTimeToUtc } from "@/lib/tz";
import { DEFAULT_ZMANIM, ZMAN_DEFS, ZmanKey } from "@/lib/zmanim";

export const dynamic = "force-dynamic";

const VALID_KEYS = new Set(ZMAN_DEFS.map((z) => z.key));

export function GET(req: NextRequest) {
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

  const tiles = buildTiles({
    from: fromLL,
    to: toLL,
    windowStartMs,
    windowMinutes,
    bucketMinutes,
    durationMs,
    zmanim,
  });

  const km = gcDistanceKm(fromLL, toLL);
  const bearing = initialBearing(fromLL, toLL);
  const lonDiff = ((to.lon - from.lon + 540) % 360) - 180;

  // Arctic advisory computed on the nominal mid-window scenario
  const arctic = arcticCrossings({
    takeoffMs: windowStartMs + (windowMinutes / 2) * 60_000,
    durationMs,
    from: fromLL,
    to: toLL,
  });

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
      durationMs,
      durationEstimated: !(durationMinutes > 30 && durationMinutes < 1500),
      estimatedDurationMs: estimatedMs,
      zmanim,
      arctic: arctic.enter != null ? arctic : null,
    },
    tiles,
  });
}

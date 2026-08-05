import { NextRequest, NextResponse } from "next/server";
import { findAirport } from "@/lib/airports";
import {
  arcticCrossings,
  estimateDurationMs,
  exactCrossings,
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
  const takeoffStr = p.get("takeoff"); // HH:mm, origin-local
  if (
    !dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ||
    !takeoffStr || !/^\d{1,2}:\d{2}$/.test(takeoffStr)
  ) {
    return NextResponse.json(
      { error: "date (YYYY-MM-DD) and takeoff (HH:mm) are required" },
      { status: 400 }
    );
  }
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [hh, mm] = takeoffStr.split(":").map(Number);
  const takeoffMs = zonedTimeToUtc(from.tz, y, mo, d, hh, mm);

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

  const spread = 0.06;
  const crossings = exactCrossings({
    from: fromLL,
    to: toLL,
    takeoffMs,
    durationMs,
    durationSpread: spread,
    zmanim,
  });

  const km = gcDistanceKm(fromLL, toLL);
  const lonDiff = ((to.lon - from.lon + 540) % 360) - 180;
  const arctic = arcticCrossings({ takeoffMs, durationMs, from: fromLL, to: toLL });

  return NextResponse.json({
    meta: {
      from,
      to,
      distanceKm: Math.round(km),
      distanceMi: Math.round(km * 0.621371),
      bearing: Math.round(initialBearing(fromLL, toLL)),
      direction:
        Math.abs(lonDiff) < 15
          ? to.lat > from.lat
            ? "Northbound"
            : "Southbound"
          : lonDiff > 0
            ? "Eastbound"
            : "Westbound",
      timezone: from.tz,
      dst: isDst(from.tz, takeoffMs),
      takeoffMs,
      durationMs,
      durationEstimated: !(durationMinutes > 30 && durationMinutes < 1500),
      estimatedDurationMs: estimatedMs,
      zmanim,
      arctic: arctic.enter != null ? arctic : null,
    },
    crossings,
    landing: {
      nominalMs: takeoffMs + durationMs,
      earliestMs: takeoffMs + Math.round(durationMs * (1 - spread)),
      latestMs: takeoffMs + Math.round(durationMs * (1 + spread)),
    },
  });
}

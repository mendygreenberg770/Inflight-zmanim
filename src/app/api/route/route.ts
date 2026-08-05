import { NextRequest, NextResponse } from "next/server";
import { Airport, findAirport } from "@/lib/airports";
import { fetchFlightAware, fetchRoute } from "@/lib/liveProviders";

export const dynamic = "force-dynamic";

function resolveAirport(iata?: string, icao?: string): Airport | undefined {
  return (iata && findAirport(iata)) || (icao && findAirport(icao)) || undefined;
}

/**
 * Route lookup by flight identifier (e.g. "UA84"), used to pre-fill the
 * chart/exact forms. FlightAware (if configured) gives schedule-quality data;
 * otherwise FlightRadar24 (current schedule) is tried, then community route
 * databases — those can be stale for reused flight numbers, so the client
 * shows the result for confirmation.
 */
export async function GET(req: NextRequest) {
  const ident = (req.nextUrl.searchParams.get("ident") ?? "").trim();
  if (!ident) {
    return NextResponse.json({ error: "ident parameter is required" }, { status: 400 });
  }
  // Set when another deployment of this app relays a lookup here; prevents
  // proxy loops if ROUTE_LOOKUP_PROXY is misconfigured to point at ourselves.
  const isProxied = req.nextUrl.searchParams.get("proxied") === "1";

  const fa = await fetchFlightAware(ident);
  if (fa?.route) {
    const from = resolveAirport(fa.route.originIata, fa.route.originIcao);
    const to = resolveAirport(fa.route.destIata, fa.route.destIcao);
    if (from && to) {
      const durationMinutes =
        fa.scheduledOffMs && fa.scheduledOnMs && fa.scheduledOnMs > fa.scheduledOffMs
          ? Math.round((fa.scheduledOnMs - fa.scheduledOffMs) / 60_000)
          : null;
      return NextResponse.json({
        from,
        to,
        source: "flightaware",
        scheduledOffMs: fa.scheduledOffMs,
        durationMinutes,
      });
    }
  }

  const route = await fetchRoute(ident, undefined, { noProxy: isProxied });
  if (route) {
    const from = resolveAirport(route.originIata, route.originIcao);
    const to = resolveAirport(route.destIata, route.destIcao);
    if (from && to) {
      const durationMinutes =
        route.scheduledDepMs && route.scheduledArrMs && route.scheduledArrMs > route.scheduledDepMs
          ? Math.round((route.scheduledArrMs - route.scheduledDepMs) / 60_000)
          : null;
      return NextResponse.json({
        from,
        to,
        source: route.source,
        scheduledOffMs: route.scheduledDepMs ?? null,
        durationMinutes,
      });
    }
  }

  return NextResponse.json(
    {
      error: "not_found",
      message:
        "No route found for this flight number. Community route databases don't cover every flight — enter the airports manually.",
    },
    { status: 404 }
  );
}

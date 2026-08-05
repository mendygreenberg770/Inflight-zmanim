import { NextRequest, NextResponse } from "next/server";
import { findAirport } from "@/lib/airports";
import { fetchRecentTracks } from "@/lib/liveProviders";

export const dynamic = "force-dynamic";

/**
 * Recent recorded flightpaths for a flight number (FR24 playback data).
 * Also serves as the relay target for deployments where FR24 is blocked
 * (see ROUTE_LOOKUP_PROXY); `proxied=1` marks relayed requests so a
 * misconfigured proxy can never loop.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const ident = (p.get("ident") ?? "").trim();
  if (!ident) {
    return NextResponse.json({ error: "ident parameter is required" }, { status: 400 });
  }
  const from = p.get("from") ? findAirport(p.get("from")!) : undefined;
  const to = p.get("to") ? findAirport(p.get("to")!) : undefined;

  const tracks = await fetchRecentTracks(ident, {
    fromCodes: from ? [from.iata, from.icao] : undefined,
    toCodes: to ? [to.iata, to.icao] : undefined,
    noProxy: p.get("proxied") === "1",
  });

  return NextResponse.json({ tracks });
}

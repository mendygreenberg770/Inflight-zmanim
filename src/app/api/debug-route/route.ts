import { NextRequest, NextResponse } from "next/server";
import { candidateCallsigns, toIataFlightNumber } from "@/lib/airlines";
import { BROWSER_HEADERS, fetchRoute } from "@/lib/liveProviders";

export const dynamic = "force-dynamic";

/**
 * Diagnostics: shows exactly what every route source returns for a flight,
 * as seen from THIS deployment's network. Open in a browser:
 *   /api/debug-route?ident=UA994
 */

interface Probe {
  url: string;
  status: number | string;
  body: string;
}

async function probe(url: string, init?: RequestInit): Promise<Probe> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    const text = await res.text();
    return { url, status: res.status, body: text.slice(0, 700) };
  } catch (e) {
    return { url, status: "fetch failed", body: e instanceof Error ? e.message : String(e) };
  }
}

export async function GET(req: NextRequest) {
  const ident = (req.nextUrl.searchParams.get("ident") ?? "UA994").trim();
  const flightNumber = toIataFlightNumber(ident);
  const callsigns = candidateCallsigns(ident);
  const cs = callsigns[0];

  const [fr24List, fr24Find, adsbdb, routeset] = await Promise.all([
    probe(
      `https://api.flightradar24.com/common/v1/flight/list.json?query=${encodeURIComponent(flightNumber)}&fetchBy=flight&limit=10`,
      { headers: BROWSER_HEADERS }
    ),
    probe(
      `https://www.flightradar24.com/v1/search/web/find?query=${encodeURIComponent(flightNumber)}&limit=15`,
      { headers: BROWSER_HEADERS }
    ),
    probe(`https://api.adsbdb.com/v0/callsign/${cs}`),
    probe(`https://api.adsb.lol/api/0/routeset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planes: [{ callsign: cs, lat: 0, lng: 0 }] }),
    }),
  ]);

  const finalDecision = await fetchRoute(ident);

  return NextResponse.json(
    {
      input: { ident, flightNumber, callsigns },
      probes: { fr24List, fr24Find, adsbdb, routeset },
      finalDecision,
      note: "finalDecision is what the app will use (FR24 first, then routeset/adsbdb). If fr24List/fr24Find show 402/403/451 or HTML instead of JSON, FlightRadar24 is blocking this server's IP — set FLIGHTAWARE_API_KEY for authoritative routes.",
    },
    { headers: { "cache-control": "no-store" } }
  );
}

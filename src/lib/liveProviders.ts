/**
 * Live flight data providers.
 *
 * Free, keyless providers (used by default):
 *   - api.adsb.lol        — live ADS-B position by callsign
 *   - api.airplanes.live  — live ADS-B position by callsign (fallback)
 *   - api.adsbdb.com      — callsign → origin/destination route lookup
 *
 * Optional (better schedule/route/ETA data), enabled when the env var is set:
 *   - FlightAware AeroAPI — FLIGHTAWARE_API_KEY
 */

import { candidateCallsigns } from "./airlines";

export interface LivePosition {
  callsign: string;
  hex?: string;
  lat: number;
  lon: number;
  /** feet */
  altitude: number | null;
  /** knots */
  groundSpeedKt: number | null;
  /** degrees true */
  track: number | null;
  aircraftType?: string;
  source: string;
  timestampMs: number;
}

export interface RouteInfo {
  originIata?: string;
  originIcao?: string;
  destIata?: string;
  destIcao?: string;
  source: string;
}

const FETCH_TIMEOUT_MS = 8000;

async function getJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

interface AdsbAircraft {
  flight?: string;
  hex?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  alt_geom?: number;
  gs?: number;
  track?: number;
  t?: string;
  seen?: number;
}

function parseAdsbResponse(data: unknown, source: string): LivePosition | null {
  const ac = (data as { ac?: AdsbAircraft[] })?.ac;
  if (!Array.isArray(ac)) return null;
  // Prefer airborne aircraft with a recent position
  const candidates = ac
    .filter((a) => typeof a.lat === "number" && typeof a.lon === "number")
    .sort((a, b) => (a.seen ?? 999) - (b.seen ?? 999));
  const best = candidates.find((a) => a.alt_baro !== "ground") ?? candidates[0];
  if (!best) return null;
  return {
    callsign: (best.flight ?? "").trim(),
    hex: best.hex,
    lat: best.lat as number,
    lon: best.lon as number,
    altitude: typeof best.alt_baro === "number" ? best.alt_baro : best.alt_geom ?? null,
    groundSpeedKt: best.gs ?? null,
    track: best.track ?? null,
    aircraftType: best.t,
    source,
    timestampMs: Date.now() - Math.round((best.seen ?? 0) * 1000),
  };
}

export async function fetchLivePosition(flightInput: string): Promise<LivePosition | null> {
  const callsigns = candidateCallsigns(flightInput);
  for (const cs of callsigns) {
    for (const base of [
      { url: `https://api.adsb.lol/v2/callsign/${cs}`, source: "adsb.lol" },
      { url: `https://api.airplanes.live/v2/callsign/${cs}`, source: "airplanes.live" },
    ]) {
      try {
        const pos = parseAdsbResponse(await getJson(base.url), base.source);
        if (pos) return pos;
      } catch {
        // provider unavailable — try the next one
      }
    }
  }
  return null;
}

interface AdsbdbAirport {
  iata_code?: string;
  icao_code?: string;
}

export async function fetchRoute(flightInput: string): Promise<RouteInfo | null> {
  for (const cs of candidateCallsigns(flightInput)) {
    try {
      const data = (await getJson(`https://api.adsbdb.com/v0/callsign/${cs}`)) as {
        response?: {
          flightroute?: { origin?: AdsbdbAirport; destination?: AdsbdbAirport };
        };
      };
      const fr = data?.response?.flightroute;
      if (fr?.origin && fr?.destination) {
        return {
          originIata: fr.origin.iata_code,
          originIcao: fr.origin.icao_code,
          destIata: fr.destination.iata_code,
          destIcao: fr.destination.icao_code,
          source: "adsbdb",
        };
      }
    } catch {
      // try next callsign
    }
  }
  return null;
}

// ── FlightAware AeroAPI (optional) ───────────────────────────────────────────

interface FaFlight {
  ident: string;
  fa_flight_id: string;
  origin?: { code_iata?: string; code_icao?: string };
  destination?: { code_iata?: string; code_icao?: string };
  actual_off?: string | null;
  actual_on?: string | null;
  estimated_on?: string | null;
  last_position?: {
    latitude: number;
    longitude: number;
    altitude: number; // hundreds of feet
    groundspeed: number;
    heading: number;
    timestamp: string;
  } | null;
}

export interface FlightAwareData {
  route: RouteInfo;
  position: LivePosition | null;
  estimatedOnMs: number | null;
  actualOffMs: number | null;
}

export async function fetchFlightAware(flightInput: string): Promise<FlightAwareData | null> {
  const apiKey = process.env.FLIGHTAWARE_API_KEY;
  if (!apiKey) return null;

  const ident = flightInput.toUpperCase().replace(/\s+/g, "");
  try {
    const data = (await getJson(
      `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}`,
      { "x-apikey": apiKey }
    )) as { flights?: FaFlight[] };

    const flights = data.flights ?? [];
    // Prefer the flight currently in the air, else the next upcoming one
    const flight =
      flights.find((f) => f.actual_off && !f.actual_on) ??
      flights.find((f) => !f.actual_on) ??
      flights[0];
    if (!flight) return null;

    let position: LivePosition | null = null;
    const lp = flight.last_position;
    if (lp) {
      position = {
        callsign: flight.ident,
        lat: lp.latitude,
        lon: lp.longitude,
        altitude: lp.altitude * 100,
        groundSpeedKt: lp.groundspeed,
        track: lp.heading,
        source: "flightaware",
        timestampMs: Date.parse(lp.timestamp),
      };
    }

    return {
      route: {
        originIata: flight.origin?.code_iata,
        originIcao: flight.origin?.code_icao,
        destIata: flight.destination?.code_iata,
        destIcao: flight.destination?.code_icao,
        source: "flightaware",
      },
      position,
      estimatedOnMs: flight.estimated_on ? Date.parse(flight.estimated_on) : null,
      actualOffMs: flight.actual_off ? Date.parse(flight.actual_off) : null,
    };
  } catch {
    return null;
  }
}

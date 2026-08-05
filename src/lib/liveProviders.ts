/**
 * Live flight data providers.
 *
 * Free, keyless providers (used by default):
 *   - api.flightradar24.com — flight-number → current schedule/route lookup
 *   - api.adsb.lol          — live ADS-B position by callsign
 *   - api.airplanes.live    — live ADS-B position by callsign (fallback)
 *   - api.adsbdb.com        — callsign → origin/destination route lookup
 *
 * Optional (better schedule/route/ETA data), enabled when the env var is set:
 *   - FlightAware AeroAPI — FLIGHTAWARE_API_KEY
 */

import { candidateCallsigns, toIataFlightNumber } from "./airlines";

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
  /** Scheduled departure time (ms since epoch), when the source provides it. */
  scheduledDepMs?: number;
  /** Scheduled arrival time (ms since epoch), when the source provides it. */
  scheduledArrMs?: number;
  /** True when the source reports this flight as currently in the air. */
  live?: boolean;
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

// ── FlightRadar24 (keyless schedule lookup) ─────────────────────────────────

/**
 * Loose shape of an entry in FR24's flight list response. Different
 * deployments have returned slightly different nesting, so every access
 * below goes through optional chaining.
 */
interface Fr24Flight {
  identification?: {
    id?: string | null;
    number?: { default?: string | null };
    callsign?: string | null;
  };
  status?: {
    live?: boolean;
    generic?: { status?: { text?: string } };
  };
  airport?: {
    origin?: { code?: { iata?: string; icao?: string } } | null;
    destination?: { code?: { iata?: string; icao?: string } } | null;
  };
  time?: {
    scheduled?: { departure?: number | null; arrival?: number | null };
    real?: { departure?: number | null; arrival?: number | null };
  };
}

const fr24Cache = new Map<string, { data: RouteInfo | null; expires: number }>();
// Successful lookups are safe to keep for hours (schedules don't churn), but a
// failure is usually a transient bot-block — retry quickly instead of letting
// one blocked request poison the cache and force stale-DB fallbacks.
const FR24_CACHE_HIT_TTL_MS = 6 * 3600_000;
const FR24_CACHE_MISS_TTL_MS = 90_000;

export const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  Accept: "application/json",
};

/** Raw FR24 flight-list fetch: recent flights (live, scheduled, and landed) for a flight number. */
async function fr24ListRaw(flightNumber: string): Promise<Fr24Flight[] | null> {
  try {
    const url =
      "https://api.flightradar24.com/common/v1/flight/list.json?query=" +
      encodeURIComponent(flightNumber) +
      "&fetchBy=flight&limit=20";
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: { response?: { data?: Fr24Flight[] | null } };
    };
    const data = json?.result?.response?.data;
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/** FR24 flight-list endpoint (richest data, but bot-protected on some networks). */
async function fr24List(flightNumber: string): Promise<RouteInfo | null> {
  let result: RouteInfo | null = null;
  {
    const data = await fr24ListRaw(flightNumber);
    if (data) {
      const flights = data.filter((f) => {
        const o = f?.airport?.origin?.code;
        const d = f?.airport?.destination?.code;
        return Boolean((o?.iata || o?.icao) && (d?.iata || d?.icao));
      });

      // Prefer the flight currently in the air; else the next scheduled
      // departure (allowing 6h of slack for delays); else the most recent
      // entry that has both airports.
      const nowSec = Date.now() / 1000;
      const upcoming = flights
        .filter((f) => (f?.time?.scheduled?.departure ?? 0) >= nowSec - 6 * 3600)
        .sort(
          (a, b) => (a?.time?.scheduled?.departure ?? Infinity) - (b?.time?.scheduled?.departure ?? Infinity)
        );
      const flight = flights.find((f) => f?.status?.live === true) ?? upcoming[0] ?? flights[0];

      if (flight) {
        const dep = flight?.time?.scheduled?.departure;
        const arr = flight?.time?.scheduled?.arrival;
        result = {
          originIata: flight?.airport?.origin?.code?.iata,
          originIcao: flight?.airport?.origin?.code?.icao,
          destIata: flight?.airport?.destination?.code?.iata,
          destIcao: flight?.airport?.destination?.code?.icao,
          source: "flightradar24",
          scheduledDepMs: typeof dep === "number" ? dep * 1000 : undefined,
          scheduledArrMs: typeof arr === "number" ? arr * 1000 : undefined,
          live: flight?.status?.live === true,
        };
      }
    }
  }
  return result;
}

/**
 * FR24 web-search endpoint — a fallback served from a different edge than the
 * list API, so it sometimes works where list.json is bot-blocked. Entries look
 * like { type: "live"|"schedule", detail: { flight, callsign, schd_from,
 * schd_to, route: "Newark (EWR) ⟶ Brussels (BRU)" } }.
 */
async function fr24Find(flightNumber: string): Promise<RouteInfo | null> {
  try {
    const url =
      "https://www.flightradar24.com/v1/search/web/find?query=" +
      encodeURIComponent(flightNumber) +
      "&limit=15";
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: {
        type?: string;
        detail?: {
          flight?: string | null;
          callsign?: string | null;
          schd_from?: string | null;
          schd_to?: string | null;
          route?: string | null;
        } | null;
      }[];
    };
    const results = Array.isArray(json?.results) ? json.results : [];
    const matches = results.filter(
      (r) => (r?.detail?.flight ?? "").toUpperCase() === flightNumber
    );
    const pick =
      matches.find((r) => r?.type === "live") ??
      matches.find((r) => r?.type === "schedule") ??
      matches[0];
    if (!pick?.detail) return null;

    // schd_from/schd_to may be IATA (3 chars) or ICAO (4); the route string
    // "City (AAA) ⟶ City (BBB)" is a last-resort source of IATA codes.
    const codes = { originIata: "", originIcao: "", destIata: "", destIcao: "" };
    const assign = (code: string | null | undefined, side: "origin" | "dest") => {
      const c = (code ?? "").toUpperCase();
      if (/^[A-Z]{3}$/.test(c)) codes[`${side}Iata`] = c;
      else if (/^[A-Z0-9]{4}$/.test(c)) codes[`${side}Icao`] = c;
    };
    assign(pick.detail.schd_from, "origin");
    assign(pick.detail.schd_to, "dest");
    if (!codes.originIata && !codes.originIcao) {
      const m = [...(pick.detail.route ?? "").matchAll(/\(([A-Z]{3})\)/g)];
      if (m.length >= 2) {
        codes.originIata = m[0][1];
        codes.destIata = m[m.length - 1][1];
      }
    }
    if ((!codes.originIata && !codes.originIcao) || (!codes.destIata && !codes.destIcao)) {
      return null;
    }
    return {
      originIata: codes.originIata || undefined,
      originIcao: codes.originIcao || undefined,
      destIata: codes.destIata || undefined,
      destIcao: codes.destIcao || undefined,
      source: "flightradar24-search",
      live: pick.type === "live",
    };
  } catch {
    return null;
  }
}

/**
 * Sibling-deployment relay: FlightRadar24 blocks some hosting providers'
 * egress IPs (e.g. Vercel/AWS) while allowing others (e.g. Cloudflare
 * Workers). Set ROUTE_LOOKUP_PROXY on the blocked deployment to the base URL
 * of a working deployment of this same app (e.g. https://xxx.workers.dev) and
 * route lookups are relayed to its /api/route. `proxied=1` marks relayed
 * requests so a misconfigured proxy target can never loop.
 */
async function fetchRouteViaProxy(flightNumber: string): Promise<RouteInfo | null> {
  const base = process.env.ROUTE_LOOKUP_PROXY?.replace(/\/+$/, "");
  if (!base) return null;
  try {
    const res = await fetch(
      `${base}/api/route?ident=${encodeURIComponent(flightNumber)}&proxied=1`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" }
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      from?: { iata?: string; icao?: string };
      to?: { iata?: string; icao?: string };
      source?: string;
      scheduledOffMs?: number | null;
      durationMinutes?: number | null;
    };
    if (!j?.from?.iata && !j?.from?.icao) return null;
    if (!j?.to?.iata && !j?.to?.icao) return null;
    return {
      originIata: j.from?.iata,
      originIcao: j.from?.icao,
      destIata: j.to?.iata,
      destIcao: j.to?.icao,
      source: `${j.source ?? "unknown"} (via proxy)`,
      scheduledDepMs: j.scheduledOffMs ?? undefined,
      scheduledArrMs:
        j.scheduledOffMs && j.durationMinutes
          ? j.scheduledOffMs + j.durationMinutes * 60_000
          : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * FlightRadar24 flight-number lookup: reflects the *current* schedule, so it
 * avoids the stale-route problem of community callsign→route databases
 * (airlines reuse flight numbers on new routes). Tries the list API first,
 * then the search API, then the sibling-deployment relay (if configured).
 */
export async function fetchRouteFr24(
  flightInput: string,
  opts?: { noProxy?: boolean }
): Promise<RouteInfo | null> {
  const flightNumber = toIataFlightNumber(flightInput);
  if (!flightNumber) return null;

  const cached = fr24Cache.get(flightNumber);
  if (cached && cached.expires > Date.now()) return cached.data;

  const result =
    (await fr24List(flightNumber)) ??
    (await fr24Find(flightNumber)) ??
    (opts?.noProxy ? null : await fetchRouteViaProxy(flightNumber));

  fr24Cache.set(flightNumber, {
    data: result,
    expires: Date.now() + (result ? FR24_CACHE_HIT_TTL_MS : FR24_CACHE_MISS_TTL_MS),
  });
  return result;
}

// ── FlightRadar24 recorded flightpaths (the MyZmanim approach) ───────────────

export interface RecordedTrack {
  /** e.g. "2026-08-04 (UAL994)" */
  label: string;
  durationMs: number;
  /** Normalized waypoints: frac 0 = takeoff, 1 = landing. */
  points: { frac: number; lat: number; lon: number }[];
}

interface Fr24PlaybackPoint {
  latitude?: number;
  longitude?: number;
  altitude?: { feet?: number };
  speed?: { kts?: number };
  timestamp?: number;
}

const trackCache = new Map<string, { data: RecordedTrack[]; expires: number }>();
const TRACK_CACHE_HIT_TTL_MS = 6 * 3600_000;
const TRACK_CACHE_MISS_TTL_MS = 2 * 60_000;

const MAX_TRACK_POINTS = 240;

function normalizeTrack(points: Fr24PlaybackPoint[], label: string): RecordedTrack | null {
  // Keep only airborne samples with a full fix
  const airborne = points.filter(
    (p) =>
      typeof p.latitude === "number" &&
      typeof p.longitude === "number" &&
      typeof p.timestamp === "number" &&
      ((p.altitude?.feet ?? 0) > 400 || (p.speed?.kts ?? 0) > 90)
  );
  if (airborne.length < 15) return null;

  const t0 = airborne[0].timestamp as number;
  const t1 = airborne[airborne.length - 1].timestamp as number;
  const durationMs = (t1 - t0) * 1000;
  if (durationMs < 30 * 60_000 || durationMs > 20 * 3600_000) return null;

  const stride = Math.max(1, Math.ceil(airborne.length / MAX_TRACK_POINTS));
  const pts: RecordedTrack["points"] = [];
  let lastFrac = -1;
  for (let i = 0; i < airborne.length; i += stride) {
    const p = airborne[i];
    const frac = ((p.timestamp as number) - t0) / (t1 - t0);
    if (frac <= lastFrac) continue;
    pts.push({
      frac,
      lat: Math.round((p.latitude as number) * 1000) / 1000,
      lon: Math.round((p.longitude as number) * 1000) / 1000,
    });
    lastFrac = frac;
  }
  const last = airborne[airborne.length - 1];
  if (lastFrac < 1) {
    pts.push({ frac: 1, lat: last.latitude as number, lon: last.longitude as number });
  }
  if (pts.length < 10) return null;
  return { label, durationMs, points: pts };
}

async function fr24Playback(flightId: string, label: string): Promise<RecordedTrack | null> {
  try {
    const res = await fetch(
      `https://api.flightradar24.com/common/v1/flight-playback.json?flightId=${encodeURIComponent(flightId)}`,
      {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: {
        response?: { data?: { flight?: { track?: Fr24PlaybackPoint[] | null } | null } | null };
      };
    };
    const track = json?.result?.response?.data?.flight?.track;
    if (!Array.isArray(track)) return null;
    return normalizeTrack(track, label);
  } catch {
    return null;
  }
}

const codeMatches = (codes: string[] | undefined, iata?: string, icao?: string) =>
  !codes ||
  codes.length === 0 ||
  codes.some((c) => c && (c === (iata ?? "").toUpperCase() || c === (icao ?? "").toUpperCase()));

/**
 * Recent completed flightpaths of a flight number, from FR24 playback data —
 * the same idea as MyZmanim's "5 most recent flightpaths". Restricted to
 * flights matching the requested route so a schedule change doesn't mix in
 * tracks of a different city pair. Relays through ROUTE_LOOKUP_PROXY when
 * FR24 is blocked on this host.
 */
export async function fetchRecentTracks(
  flightInput: string,
  opts?: { fromCodes?: string[]; toCodes?: string[]; max?: number; noProxy?: boolean }
): Promise<RecordedTrack[]> {
  const flightNumber = toIataFlightNumber(flightInput);
  if (!flightNumber) return [];
  const max = opts?.max ?? 5;
  const cacheKey = `${flightNumber}|${(opts?.fromCodes ?? []).join(",")}|${(opts?.toCodes ?? []).join(",")}`;
  const cached = trackCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  let tracks: RecordedTrack[] = [];

  const list = await fr24ListRaw(flightNumber);
  if (list) {
    const completed = list
      .filter(
        (f) =>
          f?.identification?.id &&
          typeof f?.time?.real?.departure === "number" &&
          typeof f?.time?.real?.arrival === "number" &&
          codeMatches(opts?.fromCodes, f?.airport?.origin?.code?.iata, f?.airport?.origin?.code?.icao) &&
          codeMatches(opts?.toCodes, f?.airport?.destination?.code?.iata, f?.airport?.destination?.code?.icao)
      )
      .sort((a, b) => (b.time?.real?.departure ?? 0) - (a.time?.real?.departure ?? 0))
      .slice(0, max);

    const fetched = await Promise.all(
      completed.map((f) => {
        const dep = f.time?.real?.departure;
        const label = dep
          ? new Date(dep * 1000).toISOString().slice(0, 10)
          : (f.identification?.id as string);
        return fr24Playback(f.identification!.id as string, label);
      })
    );
    tracks = fetched.filter((t): t is RecordedTrack => t != null);
  }

  // Relay through a sibling deployment when FR24 is blocked here
  if (tracks.length === 0 && !opts?.noProxy) {
    const base = process.env.ROUTE_LOOKUP_PROXY?.replace(/\/+$/, "");
    if (base) {
      try {
        const params = new URLSearchParams({ ident: flightNumber, proxied: "1" });
        if (opts?.fromCodes?.[0]) params.set("from", opts.fromCodes[0]);
        if (opts?.toCodes?.[0]) params.set("to", opts.toCodes[0]);
        const res = await fetch(`${base}/api/tracks?${params}`, {
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
        });
        if (res.ok) {
          const j = (await res.json()) as { tracks?: RecordedTrack[] };
          if (Array.isArray(j?.tracks)) tracks = j.tracks;
        }
      } catch {
        // fall through to great-circle
      }
    }
  }

  trackCache.set(cacheKey, {
    data: tracks,
    expires: Date.now() + (tracks.length ? TRACK_CACHE_HIT_TTL_MS : TRACK_CACHE_MISS_TTL_MS),
  });
  return tracks;
}

interface AdsbdbAirport {
  iata_code?: string;
  icao_code?: string;
}

export async function fetchRouteAdsbdb(flightInput: string): Promise<RouteInfo | null> {
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

/**
 * adsb.lol routeset API: looks up the route for a callsign and — when a live
 * position is supplied — checks it for plausibility against that position.
 * Community data (same upstream family as adsbdb) but with the extra sanity
 * signal, so it's preferred when the aircraft is airborne.
 */
export async function fetchRouteset(
  flightInput: string,
  pos?: { lat: number; lon: number }
): Promise<(RouteInfo & { plausible: boolean | null }) | null> {
  for (const cs of candidateCallsigns(flightInput)) {
    try {
      const res = await fetch("https://api.adsb.lol/api/0/routeset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planes: [{ callsign: cs, lat: pos?.lat ?? 0, lng: pos?.lon ?? 0 }],
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        callsign?: string;
        airport_codes?: string;
        plausible?: number | boolean;
        _airports?: { iata?: string; icao?: string }[];
      }[];
      const entry = Array.isArray(data) ? data[0] : undefined;
      const airports = entry?._airports;
      if (
        entry &&
        entry.airport_codes &&
        entry.airport_codes !== "unknown" &&
        Array.isArray(airports) &&
        airports.length >= 2
      ) {
        // Multi-leg routes list every stop; take the endpoints.
        const first = airports[0];
        const last = airports[airports.length - 1];
        return {
          originIata: first.iata,
          originIcao: first.icao,
          destIata: last.iata,
          destIcao: last.icao,
          source: "adsb.lol routeset",
          plausible: pos ? Boolean(entry.plausible) : null,
        };
      }
    } catch {
      // try next callsign
    }
  }
  return null;
}

/**
 * Best-effort route lookup. FlightRadar24 is tried first because it reflects
 * the *current* schedule for the flight number — community callsign→route
 * databases (adsb.lol routeset, adsbdb) go stale when airlines reuse flight
 * numbers on new routes. The routeset API is next (with a live position it
 * can flag implausible routes), then adsbdb, with an implausible routeset
 * answer kept only as a last resort. Callers should still sanity-check the
 * result against the live position.
 */
export async function fetchRoute(
  flightInput: string,
  pos?: { lat: number; lon: number },
  opts?: { noProxy?: boolean }
): Promise<(RouteInfo & { plausible?: boolean | null }) | null> {
  const fr24 = await fetchRouteFr24(flightInput, opts);
  if (fr24) return fr24;

  const routeset = await fetchRouteset(flightInput, pos);
  // A routeset answer flagged implausible for the current position is worse
  // than trying another source; only accept it as a last resort.
  if (routeset && routeset.plausible !== false) return routeset;
  const adsbdb = await fetchRouteAdsbdb(flightInput);
  if (adsbdb) return adsbdb;
  return routeset;
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
  scheduled_off?: string | null;
  scheduled_on?: string | null;
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
  scheduledOffMs: number | null;
  scheduledOnMs: number | null;
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
      scheduledOffMs: flight.scheduled_off ? Date.parse(flight.scheduled_off) : null,
      scheduledOnMs: flight.scheduled_on ? Date.parse(flight.scheduled_on) : null,
    };
  } catch {
    return null;
  }
}

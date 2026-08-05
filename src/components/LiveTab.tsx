"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AirportInput from "./AirportInput";
import { AIRLINES } from "@/lib/airlines";
import { fmtDayTime, fmtRelative, fmtTime } from "@/lib/format";
import { ZMAN_DEFS, ZmanKey } from "@/lib/zmanim";

const SORTED_AIRLINES = [...AIRLINES].sort((a, b) => a.name.localeCompare(b.name));

const REFRESH_SECONDS = 60;

interface Airport {
  iata: string;
  city: string;
  country: string;
  tz: string;
}

interface LiveData {
  flight: {
    callsign: string;
    aircraftType: string | null;
    source: string;
    positionTimestampMs: number;
    lat: number;
    lon: number;
    altitudeFt: number | null;
    groundSpeedKt: number | null;
    track: number | null;
  };
  route: {
    from: Airport | null;
    to: Airport | null;
    destKnown: boolean;
    source: string | null;
    suspect: boolean;
    suspectMessage: string | null;
  };
  nowMs: number;
  etaMs: number | null;
  remainingKm: number | null;
  sunElevationNow: number;
  crossings: { zman: ZmanKey; earliestMs: number; nominalMs: number; latestMs: number }[];
  timeline: { t: number; elev: number; lat: number; lon: number }[];
}

interface LiveError {
  error: string;
  message?: string;
  route?: { from: Airport | null; to: Airport | null } | null;
}

const ZMAN_BY_KEY = Object.fromEntries(ZMAN_DEFS.map((z) => [z.key, z]));

export default function LiveTab() {
  const [airline, setAirline] = useState("UA");
  const [flight, setFlight] = useState("");
  const [fromOverride, setFromOverride] = useState("");
  const [destOverride, setDestOverride] = useState("");
  const [demo, setDemo] = useState(false);
  const [demoFrom, setDemoFrom] = useState("EWR");
  const [demoProgress, setDemoProgress] = useState(35);
  const [tracking, setTracking] = useState(false);
  const [data, setData] = useState<LiveData | null>(null);
  const [err, setErr] = useState<LiveError | null>(null);
  const [loading, setLoading] = useState(false);
  const [clockMs, setClockMs] = useState(0);
  const [secondsToRefresh, setSecondsToRefresh] = useState(REFRESH_SECONDS);
  // The flight number field accepts either a bare number (combined with the
  // selected airline: "1403" -> "UA1403") or a full ident/callsign ("UAL1403").
  const ident = /^[0-9]+[A-Za-z]?$/.test(flight.trim())
    ? `${airline}${flight.trim()}`
    : flight.trim();

  const identRef = useRef(ident);
  const fromRef = useRef(fromOverride);
  const destRef = useRef(destOverride);
  const demoRef = useRef({ demo, demoFrom, demoProgress });
  useEffect(() => {
    identRef.current = ident;
    fromRef.current = fromOverride;
    destRef.current = destOverride;
    demoRef.current = { demo, demoFrom, demoProgress };
  }, [ident, fromOverride, destOverride, demo, demoFrom, demoProgress]);

  const refresh = useCallback(async () => {
    if (!identRef.current && !demoRef.current.demo) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ flight: identRef.current || "DEMO" });
      if (destRef.current.trim()) params.set("to", destRef.current.trim());
      if (demoRef.current.demo) {
        params.set("sim", "1");
        params.set("from", demoRef.current.demoFrom.trim());
        params.set("progress", String(demoRef.current.demoProgress / 100));
      } else if (fromRef.current.trim()) {
        params.set("from", fromRef.current.trim());
      }
      const res = await fetch(`/api/live?${params}`);
      const json = await res.json();
      if (json.error) {
        setErr(json);
        setData(null);
      } else {
        setData(json);
        setErr(null);
      }
    } catch (e) {
      setErr({ error: "network", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
      setSecondsToRefresh(REFRESH_SECONDS);
    }
  }, []);

  // 1-second clock for countdowns + auto refresh
  useEffect(() => {
    if (!tracking) return;
    const iv = setInterval(() => {
      setClockMs(Date.now());
      setSecondsToRefresh((s) => {
        if (s <= 1) {
          refresh();
          return REFRESH_SECONDS;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [tracking, refresh]);

  function start(e: React.FormEvent) {
    e.preventDefault();
    setTracking(true);
    setData(null);
    setErr(null);
    refresh();
  }

  const tz =
    data?.route.from?.tz ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC";
  // The 1s clock only starts ticking after mount; fall back to the server's "now"
  const nowMs = clockMs || data?.nowMs || 0;

  return (
    <div>
      <form
        onSubmit={start}
        className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-3 lg:grid-cols-5"
      >
        <label className="block">
          <span className="block text-sm font-medium text-gray-700">Airline</span>
          <select
            value={airline}
            onChange={(e) => setAirline(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {SORTED_AIRLINES.map((a) => (
              <option key={a.iata} value={a.iata}>
                {a.name} ({a.iata})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700">Flight number</span>
          <input
            type="text"
            value={flight}
            onChange={(e) => setFlight(e.target.value.toUpperCase())}
            placeholder="e.g. 1403 or UAL1403"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase"
            autoCorrect="off"
            spellCheck={false}
            required={!demo}
          />
        </label>
        <AirportInput
          label="Origin override (optional)"
          value={fromOverride}
          onChange={setFromOverride}
          placeholder="auto-detect"
        />
        <AirportInput
          label="Destination override (optional)"
          value={destOverride}
          onChange={setDestOverride}
          placeholder="auto-detect"
        />
        <div className="flex items-end gap-3">
          <button
            type="submit"
            disabled={loading || (!flight.trim() && !demo)}
            className="rounded-md bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Loading…" : tracking ? "Refresh now" : "Start tracking"}
          </button>
          {tracking && (
            <button
              type="button"
              onClick={() => setTracking(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              Stop
            </button>
          )}
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-4 sm:col-span-3 lg:col-span-5">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
            Demo mode (simulate a position mid-flight — no live data needed)
          </label>
          {demo && (
            <>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                From
                <input
                  type="text"
                  value={demoFrom}
                  onChange={(e) => setDemoFrom(e.target.value.toUpperCase())}
                  className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm uppercase"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                Progress
                <input
                  type="range"
                  min={0}
                  max={95}
                  value={demoProgress}
                  onChange={(e) => setDemoProgress(Number(e.target.value))}
                />
                {demoProgress}%
              </label>
              <span className="text-xs text-gray-500">
                (set the destination in the override box above)
              </span>
            </>
          )}
        </div>
      </form>

      {tracking && (
        <p className="mt-2 text-xs text-gray-500">
          Auto-refreshing in {secondsToRefresh}s — live positions via free ADS-B feeds
          (adsb.lol / airplanes.live{data?.flight.source === "flightaware" ? " / FlightAware" : ""}
          ); positions update continuously while the flight is in ADS-B coverage.
        </p>
      )}

      {err && (
        <div className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">No live data</p>
          <p>{err.message ?? err.error}</p>
          {err.route?.from && err.route?.to && (
            <p className="mt-1">
              Known route: {err.route.from.iata} → {err.route.to.iata}. The flight may not
              have taken off yet — try again after departure.
            </p>
          )}
        </div>
      )}

      {data && (
        <div className="mt-6 space-y-6">
          {/* Status card */}
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-300 bg-white p-4 text-sm shadow-sm sm:grid-cols-4 lg:grid-cols-7">
            <Stat label="Flight" value={data.flight.callsign || "—"} />
            <Stat
              label="Route"
              value={
                data.route.from && data.route.to
                  ? `${data.route.from.iata} → ${data.route.to.iata}`
                  : data.route.to
                    ? `→ ${data.route.to.iata}`
                    : "unknown"
              }
            />
            <Stat
              label="Position"
              value={`${data.flight.lat.toFixed(2)}°, ${data.flight.lon.toFixed(2)}°`}
            />
            <Stat
              label="Altitude"
              value={
                data.flight.altitudeFt != null
                  ? `${data.flight.altitudeFt.toLocaleString()} ft`
                  : "—"
              }
            />
            <Stat
              label="Ground speed"
              value={
                data.flight.groundSpeedKt != null
                  ? `${Math.round(data.flight.groundSpeedKt)} kt`
                  : "—"
              }
            />
            <Stat
              label="Sun now"
              value={`${data.sunElevationNow > 0 ? "+" : ""}${data.sunElevationNow}°`}
              hint={sunDescription(data.sunElevationNow)}
            />
            <Stat
              label="Landing (est.)"
              value={data.etaMs ? fmtTime(data.etaMs, tz) : "—"}
              hint={data.etaMs ? fmtRelative(data.etaMs, nowMs) : undefined}
            />
          </div>

          {data.route.suspect && data.route.suspectMessage && (
            <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              ⚠️ Route data looks wrong: {data.route.suspectMessage}
            </p>
          )}

          {!data.route.destKnown && (
            <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Destination unknown — projecting along the current track. Enter a destination
              override above for accurate results.
            </p>
          )}

          {/* Upcoming zmanim */}
          <div>
            <h3 className="text-lg font-bold">
              Zmanim ahead on this flight{" "}
              <span className="text-sm font-normal text-gray-500">
                (all times in {data.route.from ? `${data.route.from.city} time` : "your local time"})
              </span>
            </h3>
            {data.crossings.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">
                No zmanim boundaries are expected before landing.
              </p>
            ) : (
              <table className="mt-2 w-full max-w-3xl text-sm">
                <thead>
                  <tr className="border-b border-gray-300 text-left text-gray-500">
                    <th className="py-1 pr-4 font-medium">Zman</th>
                    <th className="py-1 pr-4 font-medium">Expected</th>
                    <th className="py-1 pr-4 font-medium">Window</th>
                    <th className="py-1 font-medium">Countdown</th>
                  </tr>
                </thead>
                <tbody>
                  {data.crossings.map((c, i) => {
                    const def = ZMAN_BY_KEY[c.zman];
                    const passed = c.nominalMs < nowMs;
                    return (
                      <tr
                        key={`${c.zman}-${i}`}
                        className={
                          "border-b border-gray-100 " +
                          (passed ? "text-gray-400" : "text-gray-900")
                        }
                      >
                        <td className="py-1.5 pr-4">
                          <span className="font-medium">{def?.label ?? c.zman}</span>{" "}
                          <span className="text-gray-500" dir="rtl">
                            {def?.hebrew}
                          </span>
                        </td>
                        <td className="whitespace-nowrap py-1.5 pr-4 font-semibold tabular-nums">
                          {fmtDayTime(c.nominalMs, tz)}
                        </td>
                        <td className="whitespace-nowrap py-1.5 pr-4 tabular-nums text-gray-500">
                          {fmtTime(c.earliestMs, tz)} – {fmtTime(c.latestMs, tz)}
                        </td>
                        <td className="whitespace-nowrap py-1.5 tabular-nums">
                          {fmtRelative(c.nominalMs, nowMs)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="mt-2 max-w-3xl text-xs text-gray-500">
              “Expected” assumes the current ground speed holds on a direct route to the
              destination; the window covers ±7% speed variation. Recomputed from the live
              position on every refresh. Use the more stringent end of the window l&rsquo;chumra.
            </p>
          </div>

          {/* Sun elevation timeline */}
          <SunTimeline data={data} tz={tz} nowMs={nowMs} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="font-semibold">{value}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function sunDescription(elev: number): string {
  if (elev > 0) return "Day";
  if (elev > -6) return "Below horizon";
  if (elev > -10.2) return "After tzeis 6°";
  if (elev > -16.9) return "Night";
  return "Halachic night (past 16.9°)";
}

function SunTimeline({
  data,
  tz,
  nowMs,
}: {
  data: LiveData;
  tz: string;
  nowMs: number;
}) {
  const { timeline, crossings } = data;
  if (timeline.length < 2) return null;

  const W = 900;
  const H = 220;
  const PAD = { l: 40, r: 12, t: 12, b: 24 };
  const t0 = timeline[0].t;
  const t1 = timeline[timeline.length - 1].t;
  const elevMin = -30;
  const elevMax = 50;

  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (e: number) =>
    PAD.t + (1 - (Math.max(elevMin, Math.min(elevMax, e)) - elevMin) / (elevMax - elevMin)) * (H - PAD.t - PAD.b);

  const path = timeline
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.elev).toFixed(1)}`)
    .join(" ");

  const refLines = [
    { e: 0, label: "horizon" },
    { e: -6, label: "tzeis 6°" },
    { e: -10.2, label: "misheyakir 10.2°" },
    { e: -16.9, label: "alos 16.9°" },
  ];

  // Hour ticks
  const ticks: number[] = [];
  const firstHour = Math.ceil(t0 / 3600_000) * 3600_000;
  for (let t = firstHour; t < t1; t += 3600_000) ticks.push(t);

  return (
    <div>
      <h3 className="text-lg font-bold">Sun altitude at the aircraft, from now to landing</h3>
      <div className="mt-2 overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="min-w-[600px] rounded-lg border border-gray-300 bg-gradient-to-b from-sky-100 to-slate-200"
          role="img"
          aria-label="Sun elevation along the remaining flight path"
        >
          {/* Night shading below horizon */}
          <rect
            x={PAD.l}
            y={y(0)}
            width={W - PAD.l - PAD.r}
            height={H - PAD.b - y(0)}
            fill="#1e293b"
            opacity={0.15}
          />
          {refLines.map((r) => (
            <g key={r.e}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y(r.e)}
                y2={y(r.e)}
                stroke={r.e === 0 ? "#475569" : "#64748b"}
                strokeDasharray={r.e === 0 ? undefined : "4 4"}
                strokeWidth={1}
              />
              <text x={PAD.l + 4} y={y(r.e) - 3} fontSize={10} fill="#475569">
                {r.label}
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={PAD.t} y2={H - PAD.b} stroke="#94a3b8" strokeWidth={0.5} />
              <text x={x(t)} y={H - 8} fontSize={10} fill="#475569" textAnchor="middle">
                {fmtTime(t, tz)}
              </text>
            </g>
          ))}
          <path d={path} fill="none" stroke="#f59e0b" strokeWidth={2.5} />
          {/* zman markers */}
          {crossings
            .filter((c) => c.nominalMs >= t0 && c.nominalMs <= t1)
            .map((c, i) => {
              const def = ZMAN_BY_KEY[c.zman];
              const cx = x(c.nominalMs);
              return (
                <g key={`${c.zman}-${i}`}>
                  <line x1={cx} x2={cx} y1={PAD.t} y2={H - PAD.b} stroke="#2563eb" strokeWidth={1} />
                  <circle cx={cx} cy={PAD.t + 8 + (i % 3) * 14} r={2.5} fill="#2563eb" />
                  <text
                    x={cx + 5}
                    y={PAD.t + 11 + (i % 3) * 14}
                    fontSize={10}
                    fill="#1d4ed8"
                    fontWeight={600}
                  >
                    {def?.label ?? c.zman}
                  </text>
                </g>
              );
            })}
          {/* now marker */}
          {nowMs >= t0 && nowMs <= t1 && (
            <line
              x1={x(nowMs)}
              x2={x(nowMs)}
              y1={PAD.t}
              y2={H - PAD.b}
              stroke="#dc2626"
              strokeWidth={1.5}
            />
          )}
        </svg>
      </div>
    </div>
  );
}

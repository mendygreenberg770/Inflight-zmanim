"use client";

import { useState } from "react";
import AirportInput from "./AirportInput";
import FlightLookup, { RouteLookupResult } from "./FlightLookup";
import {
  fmtDay,
  fmtDurationMinutes,
  fmtLongDate,
  fmtTime,
} from "@/lib/format";
import { EVENT_DEFS, ROW_DEFS, RowKey, ZMAN_DEFS, ZmanKey } from "@/lib/zmanim";

interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  tz: string;
}

interface ZmanRange {
  key: RowKey;
  earliestMs: number;
  latestMs: number;
  uncertain: boolean;
}

interface Tile {
  windowStartMs: number;
  windowEndMs: number;
  landingEarliestMs: number;
  landingLatestMs: number;
  ranges: ZmanRange[];
}

interface ChartData {
  meta: {
    from: Airport;
    to: Airport;
    distanceKm: number;
    distanceMi: number;
    direction: string;
    timezone: string;
    dst: boolean;
    windowStartMs: number;
    windowMinutes: number;
    bucketMinutes: number;
    durationMs: number;
    durationEstimated: boolean;
    estimatedDurationMs: number;
    zmanim: ZmanKey[];
    pathSource: { type: "historical" | "greatCircle"; count: number; flight?: string };
  };
  tiles: Tile[];
}

const ROW_BY_KEY = Object.fromEntries(ROW_DEFS.map((z) => [z.key, z]));

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function ChartTab() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [start, setStart] = useState("18:00");
  const [windowMinutes, setWindowMinutes] = useState(180);
  const [duration, setDuration] = useState(""); // minutes, blank = auto
  const [flightIdent, setFlightIdent] = useState("");
  const [includeRT, setIncludeRT] = useState(true);
  const [includeMK, setIncludeMK] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChartData | null>(null);

  async function generate(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const zmanim = ZMAN_DEFS.map((z) => z.key).filter((k) => {
        if (k === "tzeis72") return includeRT;
        if (k === "minchaKetana") return includeMK;
        return true;
      });
      const params = new URLSearchParams({
        from,
        to,
        date,
        start,
        windowMinutes: String(windowMinutes),
        zmanim: zmanim.join(","),
      });
      if (duration) params.set("durationMinutes", duration);
      if (flightIdent) params.set("flight", flightIdent);
      const res = await fetch(`/api/chart?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setData(json);
      if (!duration) setDuration(String(Math.round(json.meta.durationMs / 60_000)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  function applyRoute(r: RouteLookupResult) {
    setFrom(r.from.iata);
    setTo(r.to.iata);
    setFlightIdent(r.ident);
    if (r.durationMinutes) setDuration(String(r.durationMinutes));
  }

  return (
    <div>
      <FlightLookup onRoute={applyRoute} />
      <form
        onSubmit={generate}
        className="no-print grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-3 lg:grid-cols-5"
      >
        <AirportInput label="From" value={from} onChange={setFrom} placeholder="EWR" />
        <AirportInput label="To" value={to} onChange={setTo} placeholder="TLV" />
        <label className="block">
          <span className="block text-sm font-medium text-gray-700">Departure date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700">
            Scheduled takeoff <span className="font-normal text-gray-500">(origin time)</span>
          </span>
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700">Takeoff window</span>
          <select
            value={windowMinutes}
            onChange={(e) => setWindowMinutes(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value={60}>1 hour</option>
            <option value={120}>2 hours</option>
            <option value={180}>3 hours</option>
            <option value={240}>4 hours</option>
            <option value={360}>6 hours</option>
          </select>
        </label>
        <div className="col-span-2 flex flex-wrap items-center gap-4 sm:col-span-3 lg:col-span-5">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={includeRT}
              onChange={(e) => setIncludeRT(e.target.checked)}
            />
            Include Rabeinu Tam (72 min)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={includeMK}
              onChange={(e) => setIncludeMK(e.target.checked)}
            />
            Include Mincha Ketana
          </label>
          <button
            type="submit"
            disabled={loading || !from || !to}
            className="ml-auto rounded-md bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Computing…" : "Generate Chart"}
          </button>
          {data && (
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              🖨 Print
            </button>
          )}
        </div>
      </form>

      {error && (
        <p className="no-print mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {data && <ChartResult data={data} />}
    </div>
  );
}

function ChartResult({ data }: { data: ChartData }) {
  const { meta, tiles } = data;
  const tz = meta.timezone;

  const arcticRange = tiles
    .flatMap((t) => t.ranges)
    .find((r) => r.key === "arcticEnter" || r.key === "arcticExit");
  const eventKeysUsed = new Set(
    tiles.flatMap((t) => t.ranges.map((r) => r.key)).filter((k) => ROW_BY_KEY[k] && !ZMAN_DEFS.some((z) => z.key === k))
  );

  return (
    <div className="mt-6">
      {/* Header, MyZmanim-style */}
      <div className="flex flex-col gap-3 border-b-2 border-gray-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">
            Zmanim approximations for {meta.from.iata} → {meta.to.iata} ({meta.direction})
            flights
          </h2>
          <p className="text-gray-600">
            departing on {fmtLongDate(meta.windowStartMs, tz)}
          </p>
          <p className="mt-1 text-sm font-medium text-blue-800">
            Chabad opinion — tzeis 6° (Baal HaTanya) · Alter Rebbe shaos zmanios
          </p>
        </div>
        <div className="text-sm text-gray-700">
          <p>
            From: ({meta.from.iata}) {meta.from.city}, {meta.from.country}
          </p>
          <p>
            To: ({meta.to.iata}) {meta.to.city}, {meta.to.country}
          </p>
          <p>Direction: {meta.direction}</p>
          <p>
            Distance: {meta.distanceMi.toLocaleString()} miles /{" "}
            {meta.distanceKm.toLocaleString()} km
          </p>
          <p>
            Flight time used: {fmtDurationMinutes(meta.durationMs / 60_000)}
            {meta.durationEstimated ? " (estimated)" : ""}
          </p>
          <p
            className={
              meta.pathSource.type === "historical"
                ? "font-medium text-green-800"
                : "text-amber-700"
            }
          >
            {meta.pathSource.type === "historical"
              ? `Based on ${meta.pathSource.count} recent actual flightpaths of ${meta.pathSource.flight}`
              : "Based on a great-circle route estimate (no recent flightpath data)"}
          </p>
          <p className="font-semibold">All times are in {meta.from.city} time.</p>
          {meta.dst && <p>Daylight saving time</p>}
        </div>
      </div>

      {arcticRange && (
        <p className="mt-3 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ This route passes through the Arctic circle — see the Enter/Exit Arctic rows.
          Zmanim in the Arctic involve serious halachic questions — consult a Rov.
        </p>
      )}

      {/* Tiles */}
      <div className="print-grid mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {tiles.map((tile) => (
          <div
            key={tile.windowStartMs}
            className="print-tile rounded-lg border border-gray-300 shadow-sm"
          >
            <div className="rounded-t-lg border-b border-gray-300 bg-gray-800 px-3 py-2 text-center text-white">
              <p className="text-[11px] uppercase tracking-wide text-gray-300">
                Use this tile if takeoff was between
              </p>
              <p className="text-sm font-bold">
                {fmtTime(tile.windowStartMs, tz)} and {fmtTime(tile.windowEndMs, tz)}
              </p>
            </div>
            <table className="w-full text-[13px]">
              <tbody>
                {tile.ranges.map((r, i) => {
                  const def = ROW_BY_KEY[r.key];
                  return (
                    <tr
                      key={`${r.key}-${i}`}
                      className={
                        (r.uncertain ? "text-gray-400 " : "text-gray-900 ") +
                        (i % 2 ? "bg-gray-50" : "")
                      }
                      title={def?.description}
                    >
                      <td className="whitespace-nowrap px-2 py-1 font-medium">
                        {def?.label ?? r.key}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                        {fmtDay(r.earliestMs, tz)}: {fmtTime(r.earliestMs, tz)} ‐{" "}
                        {fmtTime(r.latestMs, tz)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-gray-300 font-bold">
                  <td className="whitespace-nowrap px-2 py-1">LANDING</td>
                  <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                    {fmtDay(tile.landingEarliestMs, tz)}: {fmtTime(tile.landingEarliestMs, tz)} ‐{" "}
                    {fmtTime(tile.landingLatestMs, tz)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="font-bold">Zmanim included — Chabad / Alter Rebbe</h3>
        <table className="mt-2 w-full max-w-3xl text-sm">
          <tbody>
            {[
              ...ZMAN_DEFS.filter((z) => meta.zmanim.includes(z.key)),
              ...EVENT_DEFS.filter((e) => eventKeysUsed.has(e.key)),
            ].map((z) => (
              <tr key={z.key} className="align-top">
                <td className="whitespace-nowrap py-0.5 pr-4 font-medium">{z.label}</td>
                <td className="py-0.5 pr-4 text-gray-600">{z.description}</td>
                <td className="py-0.5 text-right" dir="rtl">
                  {z.hebrew}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 space-y-2 text-xs leading-relaxed text-gray-600">
          <p>
            For each zman, the two times define the span during which the zman is expected
            to occur across the takeoff window and normal speed variations.{" "}
            <strong>Use the time that is more stringent for the given application.</strong>
          </p>
          <p>
            Zmanim shown in <span className="text-gray-400">gray</span> may or may not occur
            during your flight.
          </p>
          <p>
            TAKEOFF and LANDING are when the aircraft actually leaves/touches the ground —
            not the gate times on your itinerary.{" "}
            {meta.pathSource.type === "historical"
              ? `Times were computed along ${meta.pathSource.count} recent actual flightpaths of ${meta.pathSource.flight}; if your flightpath differs significantly from recent flights (diversion, unusual routing), do not rely on these times.`
              : "Times assume a great-circle route at typical airliner speeds; if your flight is rerouted significantly, do not rely on these times."}{" "}
            The precision achievable for zmanim in the air is lower than on the ground —
            distance yourself from the boundaries as much as possible.
          </p>
        </div>
      </div>
    </div>
  );
}

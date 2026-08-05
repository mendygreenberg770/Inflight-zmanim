"use client";

import { fetchJson } from "@/lib/clientFetch";
import { useState } from "react";
import AirportInput from "./AirportInput";
import FlightLookup, { RouteLookupResult } from "./FlightLookup";
import {
  fmtDay,
  fmtDurationMinutes,
  fmtLongDate,
  fmtTime,
} from "@/lib/format";
import { ROW_DEFS, RowKey, ZMAN_DEFS, ZmanKey } from "@/lib/zmanim";

interface Airport {
  iata: string;
  city: string;
  country: string;
  tz: string;
}

interface ExactCrossing {
  key: RowKey;
  nominalMs: number;
  earliestMs: number;
  latestMs: number;
  elapsedMs: number;
}

interface ExactData {
  meta: {
    from: Airport;
    to: Airport;
    distanceKm: number;
    distanceMi: number;
    direction: string;
    timezone: string;
    dst: boolean;
    takeoffMs: number;
    durationMs: number;
    durationEstimated: boolean;
    zmanim: ZmanKey[];
    pathSource: { type: "historical" | "greatCircle"; count: number; flight?: string };
  };
  crossings: ExactCrossing[];
  landing: { nominalMs: number; earliestMs: number; latestMs: number };
}

const ROW_BY_KEY = Object.fromEntries(ROW_DEFS.map((z) => [z.key, z]));

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function fmtElapsed(ms: number): string {
  const h = Math.floor(ms / 3600_000);
  const m = Math.round((ms % 3600_000) / 60_000);
  return `T+${h}h ${m.toString().padStart(2, "0")}m`;
}

export default function ExactTab() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [takeoff, setTakeoff] = useState("18:42");
  const [duration, setDuration] = useState(""); // minutes, blank = auto
  const [flightIdent, setFlightIdent] = useState("");
  const [includeRT, setIncludeRT] = useState(true);
  const [includeMK, setIncludeMK] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExactData | null>(null);

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
        takeoff,
        zmanim: zmanim.join(","),
      });
      if (duration) params.set("durationMinutes", duration);
      if (flightIdent) params.set("flight", flightIdent);
      const json = await fetchJson<ExactData>(`/api/exact?${params}`);
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
            Exact takeoff <span className="font-normal text-gray-500">(origin time)</span>
          </span>
          <input
            type="time"
            value={takeoff}
            onChange={(e) => setTakeoff(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700">
            Flight time <span className="font-normal text-gray-500">(min, blank = auto)</span>
          </span>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="auto"
            min={31}
            max={1499}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
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
            {loading ? "Computing…" : "Compute Zmanim"}
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

      {data && <ExactResult data={data} />}
    </div>
  );
}

function ExactResult({ data }: { data: ExactData }) {
  const { meta, crossings, landing } = data;
  const tz = meta.timezone;

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 border-b-2 border-gray-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">
            In-flight zmanim for {meta.from.iata} → {meta.to.iata} ({meta.direction})
          </h2>
          <p className="text-gray-600">
            Takeoff {fmtTime(meta.takeoffMs, tz)} on {fmtLongDate(meta.takeoffMs, tz)}
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

      {crossings.some((c) => c.key === "arcticEnter" || c.key === "arcticExit") && (
        <p className="mt-3 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ This route passes through the Arctic circle — see the Enter/Exit Arctic rows.
          Zmanim in the Arctic involve serious halachic questions — consult a Rov.
        </p>
      )}

      {crossings.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600">
          No zmanim boundaries are expected during this flight.
        </p>
      ) : (
        <table className="mt-4 w-full max-w-4xl text-sm">
          <thead>
            <tr className="border-b border-gray-300 text-left text-gray-500">
              <th className="py-1.5 pr-4 font-medium">Zman</th>
              <th className="py-1.5 pr-4 font-medium">Expected</th>
              <th className="py-1.5 pr-4 font-medium">Into flight</th>
              <th className="py-1.5 font-medium">Window (±6% speed)</th>
            </tr>
          </thead>
          <tbody>
            {crossings.map((c, i) => {
              const def = ROW_BY_KEY[c.key];
              return (
                <tr key={`${c.key}-${i}`} className="border-b border-gray-100">
                  <td className="py-2 pr-4">
                    <span className="font-medium">{def?.label ?? c.key}</span>{" "}
                    <span className="text-gray-500" dir="rtl">
                      {def?.hebrew}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-base font-bold tabular-nums">
                    {fmtDay(c.nominalMs, tz)} {fmtTime(c.nominalMs, tz)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 tabular-nums text-gray-600">
                    {fmtElapsed(c.elapsedMs)}
                  </td>
                  <td className="whitespace-nowrap py-2 tabular-nums text-gray-500">
                    {fmtTime(c.earliestMs, tz)} – {fmtTime(c.latestMs, tz)}
                  </td>
                </tr>
              );
            })}
            <tr className="font-bold">
              <td className="py-2 pr-4">LANDING</td>
              <td className="whitespace-nowrap py-2 pr-4 text-base tabular-nums">
                {fmtDay(landing.nominalMs, tz)} {fmtTime(landing.nominalMs, tz)}
              </td>
              <td className="whitespace-nowrap py-2 pr-4 tabular-nums text-gray-600">
                {fmtElapsed(meta.durationMs)}
              </td>
              <td className="whitespace-nowrap py-2 tabular-nums text-gray-500">
                {fmtTime(landing.earliestMs, tz)} – {fmtTime(landing.latestMs, tz)}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="mt-6 max-w-4xl space-y-2 text-xs leading-relaxed text-gray-600">
        <p>
          “Expected” is the best single estimate —{" "}
          {meta.pathSource.type === "historical"
            ? `computed along the median of ${meta.pathSource.count} recent actual flightpaths of ${meta.pathSource.flight}, with the window spanning all of them`
            : "assuming a great-circle route at the nominal flight time, with the window covering ±6% speed variation"}{" "}
          — <strong>use the more stringent end l&rsquo;chumra</strong>. “Into flight” is
          elapsed time after takeoff, so you can follow along with the aircraft clock
          without changing your watch.
        </p>
        <p>
          For live-position-based times once airborne (Wi-Fi required), use the Live
          Tracking tab.
        </p>
      </div>
    </div>
  );
}

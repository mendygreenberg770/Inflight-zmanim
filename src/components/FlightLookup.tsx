"use client";

import { fetchJson } from "@/lib/clientFetch";
import { useState } from "react";
import { AIRLINES } from "@/lib/airlines";

interface Airport {
  iata: string;
  city: string;
  country: string;
}

export interface RouteLookupResult {
  from: Airport;
  to: Airport;
  source: string;
  scheduledOffMs: number | null;
  durationMinutes: number | null;
  /** The flight identifier that was looked up, e.g. "UA994". */
  ident: string;
}

const SORTED_AIRLINES = [...AIRLINES].sort((a, b) => a.name.localeCompare(b.name));

/** Airline picker + flight number → looks up the route and hands it to the parent form. */
export default function FlightLookup({
  onRoute,
}: {
  onRoute: (r: RouteLookupResult) => void;
}) {
  const [airline, setAirline] = useState("UA");
  const [number, setNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<RouteLookupResult | null>(null);

  async function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    if (!number.trim()) return;
    setLoading(true);
    setError(null);
    setFound(null);
    try {
      const ident = `${airline}${number.trim()}`;
      const json = await fetchJson<Omit<RouteLookupResult, "ident">>(
        `/api/route?ident=${encodeURIComponent(ident)}`
      );
      const result = { ...json, ident };
      setFound(result);
      onRoute(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="no-print mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block text-sm font-medium text-gray-700">Airline</span>
          <select
            value={airline}
            onChange={(e) => setAirline(e.target.value)}
            className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
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
            inputMode="numeric"
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/[^0-9A-Za-z]/g, ""))}
            placeholder="e.g. 84"
            className="mt-1 w-28 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => lookup()}
          disabled={loading || !number.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Looking up…" : "Find route"}
        </button>
        {found && (
          <p className="text-sm font-medium text-green-800">
            ✓ {airline}
            {number}: {found.from.iata} ({found.from.city}) → {found.to.iata} ({found.to.city})
            {found.durationMinutes ? ` · ${Math.floor(found.durationMinutes / 60)}h ${found.durationMinutes % 60}m scheduled` : ""}
            <span className="text-gray-500"> — filled in below</span>
          </p>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Route lookup uses community flight databases (or FlightAware when configured).
        Airlines reuse flight numbers, so <strong>always confirm the airports match your
        ticket</strong> — you can correct them below.
      </p>
    </div>
  );
}

"use client";

import { useEffect, useId, useState } from "react";

interface AirportSuggestion {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
}

export default function AirportInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<AirportSuggestion[]>([]);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      if (value.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      try {
        const res = await fetch(`/api/airports?q=${encodeURIComponent(value)}`, {
          signal: ctrl.signal,
        });
        const data = await res.json();
        setSuggestions(data.airports ?? []);
      } catch {
        /* typing continues; suggestions just don't update */
      }
    }, 150);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [value]);

  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700">{label}</span>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder={placeholder ?? "e.g. EWR"}
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase focus:border-blue-500 focus:outline-none"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
      />
      <datalist id={listId}>
        {suggestions.map((a) => (
          <option key={a.icao} value={a.iata}>
            {a.city} — {a.name} ({a.iata})
          </option>
        ))}
      </datalist>
    </label>
  );
}

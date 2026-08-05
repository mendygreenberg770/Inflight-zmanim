import airportsData from "@/data/airports.json";

export interface Airport {
  icao: string;
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  tz: string;
  elev: number;
}

const airports = airportsData as Airport[];

const byIata = new Map<string, Airport>();
const byIcao = new Map<string, Airport>();
for (const a of airports) {
  if (!byIata.has(a.iata)) byIata.set(a.iata, a);
  byIcao.set(a.icao, a);
}

export function findAirport(code: string): Airport | undefined {
  const c = code.trim().toUpperCase();
  return byIata.get(c) ?? byIcao.get(c);
}

/** Simple ranked substring search for the autocomplete box. */
export function searchAirports(query: string, limit = 8): Airport[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];

  const exact = byIata.get(q) ?? byIcao.get(q);
  const results: Airport[] = exact ? [exact] : [];

  if (q.length >= 2) {
    for (const a of airports) {
      if (results.length >= limit) break;
      if (a === exact) continue;
      if (
        a.iata.startsWith(q) ||
        a.icao.startsWith(q) ||
        a.city.toUpperCase().includes(q) ||
        a.name.toUpperCase().includes(q)
      ) {
        results.push(a);
      }
    }
  }
  return results.slice(0, limit);
}

/**
 * Verifies that the built-in NOAA solar engine matches kosher-zmanim
 * (the library used by the mendygreenberg770/Zmanim project) to within
 * a few seconds for the Chabad zmanim set.
 *
 * Run: npx tsx scripts/verify-zmanim.ts
 */
import { ComplexZmanimCalendar, GeoLocation } from "kosher-zmanim";
import { zmanimForDay, ZmanKey } from "../src/lib/zmanim";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cal = any;

const CASES = [
  { name: "Newark (EWR)", lat: 40.6925, lon: -74.1687, date: "2026-08-05" },
  { name: "Brussels (BRU)", lat: 50.9014, lon: 4.4844, date: "2026-08-06" },
  { name: "Mid-Atlantic 52N 30W", lat: 52, lon: -30, date: "2026-08-06" },
  { name: "Buffalo winter", lat: 42.9405, lon: -78.7322, date: "2026-01-15" },
  { name: "Southern hemisphere (SYD)", lat: -33.9461, lon: 151.1772, date: "2026-08-05" },
];

function toMs(v: unknown): number | null {
  if (v == null) return null;
  const iso = (v as { toISO?: () => string | null }).toISO?.();
  if (!iso) return null;
  return Date.parse(iso);
}

let worst = 0;
let failures = 0;

for (const c of CASES) {
  const geo = new GeoLocation(c.name, c.lat, c.lon, 0, "UTC");
  const cal: Cal = new ComplexZmanimCalendar(geo);
  cal.setDate(new Date(c.date + "T12:00:00Z"));

  const dayStartMs = Date.parse(c.date + "T00:00:00Z");
  const mine = zmanimForDay(dayStartMs, c.lat, c.lon);

  const reference: Partial<Record<ZmanKey, number | null>> = {
    alos: toMs(cal.getAlosBaalHatanya()),
    misheyakir: toMs(cal.getMisheyakir10Point2Degrees()),
    sunrise: toMs(cal.getSeaLevelSunrise()),
    sofZmanShema: toMs(cal.getSofZmanShmaBaalHatanya()),
    sofZmanTefila: toMs(cal.getSofZmanTfilaBaalHatanya()),
    minchaGedola: toMs(cal.getMinchaGedolaBaalHatanya()),
    minchaKetana: toMs(cal.getMinchaKetanaBaalHatanya()),
    plagHamincha: toMs(cal.getPlagHaminchaBaalHatanya()),
    sunset: toMs(cal.getSeaLevelSunset()),
    tzeis: toMs(cal.getTzaisBaalHatanya()),
    tzeis72: toMs(cal.getTzais72()),
  };

  console.log(`\n=== ${c.name} ${c.date} ===`);
  for (const [key, refMs] of Object.entries(reference) as [ZmanKey, number | null][]) {
    const mineMs = mine[key] ?? null;
    if (refMs == null && mineMs == null) {
      console.log(`  ${key.padEnd(14)} both null (no event)`);
      continue;
    }
    if (refMs == null || mineMs == null) {
      console.log(`  ${key.padEnd(14)} MISMATCH null: mine=${mineMs} ref=${refMs}`);
      failures++;
      continue;
    }
    const diffSec = Math.abs(mineMs - refMs) / 1000;
    worst = Math.max(worst, diffSec);
    const flag = diffSec > 10 ? "  <-- DIFF > 10s" : "";
    if (diffSec > 10) failures++;
    console.log(
      `  ${key.padEnd(14)} mine=${new Date(mineMs).toISOString().slice(11, 19)} ref=${new Date(refMs).toISOString().slice(11, 19)} diff=${diffSec.toFixed(1)}s${flag}`
    );
  }
}

console.log(`\nWorst diff: ${worst.toFixed(1)}s, failures: ${failures}`);
process.exit(failures > 0 ? 1 : 0);

/**
 * Route-resolution diagnostic.
 *
 * Usage:  npx tsx scripts/test-route.ts UA994
 *
 * Calls each route provider directly (FlightRadar24, adsb.lol routeset,
 * adsbdb) and prints the raw result from each, followed by the decision
 * fetchRoute() makes. Run this from a machine/deployment where outbound
 * traffic to those hosts isn't blocked to see which sources work and which
 * are stale for a given flight number.
 */

import { candidateCallsigns, toIataFlightNumber } from "../src/lib/airlines";
import {
  fetchRoute,
  fetchRouteAdsbdb,
  fetchRouteFr24,
  fetchRouteset,
} from "../src/lib/liveProviders";

function fmt(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "null";
}

async function main() {
  const flight = (process.argv[2] ?? "").trim();
  if (!flight) {
    console.error("Usage: npx tsx scripts/test-route.ts <flight number>   e.g. UA994");
    process.exit(1);
  }

  console.log(`Flight input:        ${flight}`);
  console.log(`IATA flight number:  ${toIataFlightNumber(flight)}  (used by FlightRadar24)`);
  console.log(`Candidate callsigns: ${candidateCallsigns(flight).join(", ")}  (used by routeset/adsbdb)`);

  console.log("\n=== 1. FlightRadar24 (current schedule) ===");
  try {
    console.log(fmt(await fetchRouteFr24(flight)));
  } catch (e) {
    console.log(`threw: ${e}`);
  }

  console.log("\n=== 2. adsb.lol routeset (community db, plausibility check) ===");
  try {
    console.log(fmt(await fetchRouteset(flight)));
  } catch (e) {
    console.log(`threw: ${e}`);
  }

  console.log("\n=== 3. adsbdb (community db) ===");
  try {
    console.log(fmt(await fetchRouteAdsbdb(flight)));
  } catch (e) {
    console.log(`threw: ${e}`);
  }

  console.log("\n=== fetchRoute() final decision ===");
  try {
    const route = await fetchRoute(flight);
    console.log(fmt(route));
    if (route) {
      console.log(
        `\nResolved: ${route.originIata ?? route.originIcao ?? "?"} -> ${
          route.destIata ?? route.destIcao ?? "?"
        }  (source: ${route.source})`
      );
    } else {
      console.log("\nNo route resolved from any provider.");
    }
  } catch (e) {
    console.log(`threw: ${e}`);
  }
}

main();

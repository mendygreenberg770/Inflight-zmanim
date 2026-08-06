import { NextRequest, NextResponse } from "next/server";
import { fetchFr24Live } from "@/lib/liveProviders";

export const dynamic = "force-dynamic";

/**
 * FlightRadar24 live position + departure info for a flight number. Serves as
 * the relay target for deployments where FR24 is blocked (ROUTE_LOOKUP_PROXY);
 * `proxied=1` marks relayed requests so a misconfigured proxy can never loop.
 */
export async function GET(req: NextRequest) {
  const ident = (req.nextUrl.searchParams.get("ident") ?? "").trim();
  if (!ident) {
    return NextResponse.json({ error: "ident parameter is required" }, { status: 400 });
  }
  const info = await fetchFr24Live(ident, {
    noProxy: req.nextUrl.searchParams.get("proxied") === "1",
  });
  return NextResponse.json(info);
}

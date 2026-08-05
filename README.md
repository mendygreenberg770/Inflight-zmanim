# ✈️ Inflight Zmanim — Chabad

An in-flight zmanim calculator in the style of the MyZmanim Air reports, built
around the **Chabad opinion — tzeis at 6° (Baal HaTanya)** — and the Alter
Rebbe zmanim formulas used in the [Zmanim project](https://github.com/mendygreenberg770/Zmanim).

## What it does

### 📋 Pre-Flight Chart
Enter origin, destination, date, scheduled takeoff time, and a takeoff window,
and get a printable chart of tiles — one per 10-minute takeoff bucket. Circle
the tile matching your actual takeoff and you have the expected time span for
every zman during your flight, all expressed in origin-airport local time.

For each zman two times are shown: the earliest and latest it is expected to
occur given the takeoff bucket and normal speed variations (±6% flight time).
Use the more stringent end for the given halachic application. Zmanim in gray
occurred in only some scenarios and may not occur on your flight.

### 🎯 Exact Takeoff
Once you know the exact takeoff time (e.g. the wheels left the ground at 6:42),
enter it and get a single best-estimate time for every zman during the flight —
no wide ranges. Each zman also shows the elapsed time after takeoff (`T+2h 14m`)
so you can follow along on the aircraft clock, plus a small ±6%-speed window;
use the more stringent end l'chumra.

### 🛰 Live Tracking
Enter a flight number (e.g. `UA84`, `LY26`) while the flight is airborne. The
app pulls the live position, ground speed, and route, then computes the exact
expected times of every remaining zman boundary ahead of the aircraft,
refreshing every minute. Includes a sun-altitude timeline with markers at 0°
(sunrise/sunset), −6° (tzeis), −10.2° (misheyakir), and −16.9° (alos).

Live data sources (no API key required):
- [adsb.lol](https://api.adsb.lol) and [airplanes.live](https://airplanes.live) — live ADS-B positions
- [adsbdb.com](https://www.adsbdb.com) — callsign → route lookup
- **Optional:** [FlightAware AeroAPI](https://www.flightaware.com/aeroapi/) — set
  `FLIGHTAWARE_API_KEY` (see `.env.example`) for schedule-quality routes, ETAs,
  and positions with oceanic coverage.

## The zmanim (Chabad / Alter Rebbe)

| Zman | Definition |
|---|---|
| Alos HaShachar | 16.9° below horizon (72 zmanis min before hanetz amiti) |
| Misheyakir | 10.2° below horizon |
| Sunrise / Sunset | Sea level, 90.833° zenith |
| Sof Zman Shema / Tefila | 3 / 4 shaos zmanios of the hanetz-amiti day (1.583°) |
| Chatzos | Midpoint of the halachic day |
| Mincha Gedola / Ketana / Plag | 6.5 / 9.5 / 10.75 shaos zmanios |
| **Tzeis (Nightfall)** | **6° below horizon — Chabad default (~24 min)** |
| Rabeinu Tam | 72 fixed minutes after shkia (optional) |
| Chatzos HaLailah | Midpoint of shkia and next hanetz |

The solar engine is a NOAA-algorithm port verified against
[kosher-zmanim](https://github.com/BehindTheMath/KosherZmanim)'s
BaalHatanya methods to within 0.1 seconds — run `npx tsx scripts/verify-zmanim.ts`.

## How in-flight zmanim are computed

A zman occurs in flight at the instant the zman computed for the aircraft's
current position equals the current time. The engine samples the great-circle
flight path every minute, evaluates `f(t) = zman(position(t)) − t` (using the
nearest solar day, so date-line and midnight rollovers are handled), and finds
the sign changes. Takeoff-bucket edges × fast/slow flight profiles produce the
min–max span shown per tile. Routes crossing the Arctic circle get a warning
with entry/exit times.

## Running

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npx tsx scripts/verify-zmanim.ts   # verify solar engine vs kosher-zmanim
```

Deploys anywhere Next.js runs (e.g. Vercel).

## Deploying to Cloudflare

The repo is configured for Cloudflare Workers via
[@opennextjs/cloudflare](https://opennext.js.org/cloudflare) (`wrangler.jsonc`
+ `open-next.config.ts` — a stock `next build` alone won't run on Cloudflare).

**One-time deploy from your machine:**

```bash
npm install
npx wrangler login          # opens browser to authorize your Cloudflare account
npm run deploy              # builds with OpenNext and deploys the Worker
```

**Continuous deploys from GitHub** (Cloudflare dashboard → Workers & Pages →
Create → Workers → Import a repository):

- Build command: `npx opennextjs-cloudflare build`
- Deploy command: `npx opennextjs-cloudflare deploy`

**Local test in the Workers runtime:** `npm run preview`

**Optional FlightAware key:** `npx wrangler secret put FLIGHTAWARE_API_KEY`

> ⚠️ **Plan requirement:** chart generation uses ~1–2 s of CPU per request,
> and the exact/live endpoints ~0.1 s. The Workers **Free** plan allows only
> 10 ms CPU per request, so requests will be terminated (error 1102). Use the
> **Workers Paid** plan ($5/mo, 30 s CPU limit) — or deploy to Vercel, where
> the default limits are sufficient.

## Disclaimer

In-flight zmanim are approximations based on projected great-circle routes.
The precision achievable for ground locations is not achievable in the air —
distance yourself from the zmanim boundaries as much as possible, and consult
a Rov for practical halacha. If your flight is significantly rerouted, do not
rely on the computed times.

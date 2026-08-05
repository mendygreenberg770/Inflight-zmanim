/**
 * NOAA solar calculations — the same algorithm used by KosherJava / kosher-zmanim's
 * NOAACalculator, ported so zmanim can be computed for thousands of in-flight
 * positions per request without heavy dependencies.
 *
 * All angles in degrees, all times in UTC milliseconds unless noted.
 */

const DEG = Math.PI / 180;

const JULIAN_EPOCH_MS = 2440587.5; // Julian day of the Unix epoch

export function julianDayFromMs(ms: number): number {
  return ms / 86_400_000 + JULIAN_EPOCH_MS;
}

/** Julian day at 00:00 UTC for a UTC ms timestamp. */
export function julianDayAtUtcMidnight(ms: number): number {
  const dayMs = Math.floor(ms / 86_400_000) * 86_400_000;
  return julianDayFromMs(dayMs);
}

function julianCenturies(jd: number): number {
  return (jd - 2451545.0) / 36525.0;
}

function jdFromCenturies(t: number): number {
  return t * 36525.0 + 2451545.0;
}

function geomMeanLongSun(t: number): number {
  let l0 = 280.46646 + t * (36000.76983 + 0.0003032 * t);
  l0 %= 360;
  if (l0 < 0) l0 += 360;
  return l0;
}

function geomMeanAnomalySun(t: number): number {
  return 357.52911 + t * (35999.05029 - 0.0001537 * t);
}

function eccentricityEarthOrbit(t: number): number {
  return 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
}

function sunEqOfCenter(t: number): number {
  const m = geomMeanAnomalySun(t) * DEG;
  return (
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289
  );
}

function sunTrueLong(t: number): number {
  return geomMeanLongSun(t) + sunEqOfCenter(t);
}

function sunApparentLong(t: number): number {
  const omega = 125.04 - 1934.136 * t;
  return sunTrueLong(t) - 0.00569 - 0.00478 * Math.sin(omega * DEG);
}

function meanObliquityOfEcliptic(t: number): number {
  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
  return 23 + (26 + seconds / 60) / 60;
}

function obliquityCorrection(t: number): number {
  const omega = 125.04 - 1934.136 * t;
  return meanObliquityOfEcliptic(t) + 0.00256 * Math.cos(omega * DEG);
}

export function sunDeclination(t: number): number {
  const e = obliquityCorrection(t) * DEG;
  const lambda = sunApparentLong(t) * DEG;
  return Math.asin(Math.sin(e) * Math.sin(lambda)) / DEG;
}

/** Equation of time, in minutes. */
export function equationOfTime(t: number): number {
  const epsilon = obliquityCorrection(t) * DEG;
  const l0 = geomMeanLongSun(t) * DEG;
  const e = eccentricityEarthOrbit(t);
  const m = geomMeanAnomalySun(t) * DEG;

  let y = Math.tan(epsilon / 2);
  y *= y;

  const eqTime =
    y * Math.sin(2 * l0) -
    2 * e * Math.sin(m) +
    4 * e * y * Math.sin(m) * Math.cos(2 * l0) -
    0.5 * y * y * Math.sin(4 * l0) -
    1.25 * e * e * Math.sin(2 * m);
  return (eqTime / DEG) * 4;
}

/** Hour angle (radians, positive) of the sun at a given zenith, NaN if it never reaches it. */
function sunHourAngle(lat: number, solarDec: number, zenith: number): number {
  const latR = lat * DEG;
  const sdR = solarDec * DEG;
  const cosArg =
    Math.cos(zenith * DEG) / (Math.cos(latR) * Math.cos(sdR)) -
    Math.tan(latR) * Math.tan(sdR);
  if (cosArg > 1 || cosArg < -1) return NaN;
  return Math.acos(cosArg);
}

/** Solar noon in minutes from 0Z. `lonWest` is west-positive longitude (NOAA convention). */
function solarNoonUtcMinutes(t: number, lonWest: number): number {
  const tnoon = julianCenturies(jdFromCenturies(t) + lonWest / 360.0);
  let eqTime = equationOfTime(tnoon);
  const solNoonUTC = 720 + lonWest * 4 - eqTime;
  const newt = julianCenturies(jdFromCenturies(t) - 0.5 + solNoonUTC / 1440.0);
  eqTime = equationOfTime(newt);
  return 720 + lonWest * 4 - eqTime;
}

/**
 * Sun-crossing time (rising or setting) for a given zenith angle.
 *
 * @param dayStartMs  00:00 UTC of the day to compute for
 * @param lat         latitude, north positive
 * @param lon         longitude, east positive
 * @param zenith      zenith angle in degrees (e.g. 90.833 for sea-level sunrise/sunset)
 * @param rising      true for the morning crossing, false for the evening one
 * @returns UTC ms of the event, or null when the sun never reaches that zenith that day
 */
export function sunEventUtc(
  dayStartMs: number,
  lat: number,
  lon: number,
  zenith: number,
  rising: boolean
): number | null {
  const julianDay = julianDayFromMs(dayStartMs);
  const lonWest = -lon;

  const t = julianCenturies(julianDay);
  const noonmin = solarNoonUtcMinutes(t, lonWest);
  const tnoon = julianCenturies(julianDay + noonmin / 1440.0);

  // First pass
  let eqTime = equationOfTime(tnoon);
  let solarDec = sunDeclination(tnoon);
  let hourAngle = sunHourAngle(lat, solarDec, zenith);
  if (isNaN(hourAngle)) return null;
  if (!rising) hourAngle = -hourAngle;
  let delta = lonWest - hourAngle / DEG;
  let timeUTC = 720 + 4 * delta - eqTime;

  // Second pass with refined time
  const newt = julianCenturies(jdFromCenturies(t) + timeUTC / 1440.0);
  eqTime = equationOfTime(newt);
  solarDec = sunDeclination(newt);
  hourAngle = sunHourAngle(lat, solarDec, zenith);
  if (isNaN(hourAngle)) return null;
  if (!rising) hourAngle = -hourAngle;
  delta = lonWest - hourAngle / DEG;
  timeUTC = 720 + 4 * delta - eqTime;

  return dayStartMs + timeUTC * 60_000;
}

/** Solar elevation (degrees above horizon, no refraction) at an instant/location. */
export function solarElevation(ms: number, lat: number, lon: number): number {
  const t = julianCenturies(julianDayFromMs(ms));
  const eqTime = equationOfTime(t);
  const dec = sunDeclination(t) * DEG;

  const minutesUtc = ((ms % 86_400_000) + 86_400_000) % 86_400_000 / 60_000;
  let trueSolarTime = (minutesUtc + eqTime + 4 * lon) % 1440;
  if (trueSolarTime < 0) trueSolarTime += 1440;

  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;

  const latR = lat * DEG;
  const cosZenith =
    Math.sin(latR) * Math.sin(dec) +
    Math.cos(latR) * Math.cos(dec) * Math.cos(hourAngle * DEG);
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith))) / DEG;
  return 90 - zenith;
}

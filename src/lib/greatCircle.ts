/** Great-circle geometry helpers. Angles in degrees, distances in km. */

const DEG = Math.PI / 180;
export const EARTH_RADIUS_KM = 6371.0088;

export interface LatLon {
  lat: number;
  lon: number;
}

export function gcDistanceKm(a: LatLon, b: LatLon): number {
  const φ1 = a.lat * DEG, φ2 = b.lat * DEG;
  const Δφ = (b.lat - a.lat) * DEG;
  const Δλ = (b.lon - a.lon) * DEG;
  const h =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function initialBearing(a: LatLon, b: LatLon): number {
  const φ1 = a.lat * DEG, φ2 = b.lat * DEG;
  const Δλ = (b.lon - a.lon) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

/** Point along the great circle at fraction f (0 = a, 1 = b), via spherical interpolation. */
export function gcIntermediate(a: LatLon, b: LatLon, f: number): LatLon {
  const φ1 = a.lat * DEG, λ1 = a.lon * DEG;
  const φ2 = b.lat * DEG, λ2 = b.lon * DEG;

  const δ = gcDistanceKm(a, b) / EARTH_RADIUS_KM;
  if (δ < 1e-9) return { ...a };

  const sinδ = Math.sin(δ);
  const A = Math.sin((1 - f) * δ) / sinδ;
  const B = Math.sin(f * δ) / sinδ;

  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);

  return {
    lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG,
    lon: Math.atan2(y, x) / DEG,
  };
}

/**
 * Signed cross-track distance (km) of point p from the great-circle path a→b.
 * Used to sanity-check community route data against a live position.
 */
export function crossTrackKm(p: LatLon, a: LatLon, b: LatLon): number {
  const δ13 = gcDistanceKm(a, p) / EARTH_RADIUS_KM;
  const θ13 = initialBearing(a, p) * DEG;
  const θ12 = initialBearing(a, b) * DEG;
  return Math.asin(Math.sin(δ13) * Math.sin(θ13 - θ12)) * EARTH_RADIUS_KM;
}

/** Move from a point along a bearing by a distance (for track projection with no known destination). */
export function gcDestination(a: LatLon, bearingDeg: number, distanceKm: number): LatLon {
  const φ1 = a.lat * DEG, λ1 = a.lon * DEG;
  const θ = bearingDeg * DEG;
  const δ = distanceKm / EARTH_RADIUS_KM;

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );
  return { lat: φ2 / DEG, lon: (((λ2 / DEG) + 540) % 360) - 180 };
}

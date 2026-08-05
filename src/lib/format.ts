/** Client-side time formatting helpers. */

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function getFmt(tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = tz + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

/** "7:15pm" */
export function fmtTime(ms: number, tz: string): string {
  return getFmt(tz, { hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date(ms))
    .replace(" ", "")
    .toLowerCase();
}

/** "Wed" */
export function fmtDay(ms: number, tz: string): string {
  return getFmt(tz, { weekday: "short" }).format(new Date(ms));
}

/** "Wed 7:15pm" */
export function fmtDayTime(ms: number, tz: string): string {
  return `${fmtDay(ms, tz)} ${fmtTime(ms, tz)}`;
}

/** "Wednesday, August 5, 2026" */
export function fmtLongDate(ms: number, tz: string): string {
  return getFmt(tz, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(ms));
}

/** "in 1h 23m" / "23m ago" */
export function fmtRelative(ms: number, nowMs: number): string {
  const diff = ms - nowMs;
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3600_000);
  const m = Math.round((abs % 3600_000) / 60_000);
  const span = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return diff >= 0 ? `in ${span}` : `${span} ago`;
}

export function fmtDurationMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

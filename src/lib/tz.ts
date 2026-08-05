/** IANA timezone helpers built on Intl (no dependencies). */

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(timeZone, dtf);
  }
  return dtf;
}

/** UTC offset (ms) of a zone at a given instant. */
export function tzOffsetMs(timeZone: string, utcMs: number): number {
  const parts = partsFormatter(timeZone).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Convert a wall-clock time in a zone to UTC ms (handles DST via double lookup). */
export function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number
): number {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);
  let offset = tzOffsetMs(timeZone, asIfUtc);
  offset = tzOffsetMs(timeZone, asIfUtc - offset);
  return asIfUtc - offset;
}

export function isDst(timeZone: string, utcMs: number): boolean {
  const jan = tzOffsetMs(timeZone, Date.UTC(new Date(utcMs).getUTCFullYear(), 0, 15));
  const jul = tzOffsetMs(timeZone, Date.UTC(new Date(utcMs).getUTCFullYear(), 6, 15));
  return tzOffsetMs(timeZone, utcMs) > Math.min(jan, jul);
}

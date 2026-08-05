/**
 * Chabad (Alter Rebbe / Baal HaTanya) zmanim formulas, matching the defaults of
 * the mendygreenberg770/Zmanim project (which uses kosher-zmanim's BaalHatanya
 * methods):
 *
 *  - Hanetz/Shkia "amiti" (for shaos zmanios):  zenith 91.583°  (1.583° below horizon)
 *  - Alos HaShachar:                            zenith 106.9°   (16.9°)
 *  - Misheyakir:                                zenith 100.2°   (10.2°)
 *  - Sunrise / Sunset (displayed):              sea level, zenith 90.833°
 *  - Sof Zman Shema / Tefila / Mincha / Plag:   proportional hours of the amiti day
 *  - Tzeis (nightfall):                         zenith 96°      (6° — Chabad default)
 *  - Rabeinu Tam:                               72 fixed minutes after sea-level shkia
 *  - Chatzos HaLailah:                          midpoint of shkia and next hanetz
 */

import { sunEventUtc } from "./solar";

export const ZENITH_SEA_LEVEL = 90.833;
export const ZENITH_AMITI = 90 + 1.583;
export const ZENITH_ALOS_BH = 90 + 16.9;
export const ZENITH_MISHEYAKIR = 90 + 10.2;
export const ZENITH_TZEIS_BH = 90 + 6.0;
export const ZENITH_TZEIS_8_5 = 90 + 8.5;

export type ZmanKey =
  | "alos"
  | "misheyakir"
  | "sunrise"
  | "sofZmanShema"
  | "sofZmanTefila"
  | "chatzos"
  | "minchaGedola"
  | "minchaKetana"
  | "plagHamincha"
  | "sunset"
  | "tzeis"
  | "tzeis72"
  | "midnight";

export interface ZmanDef {
  key: ZmanKey;
  label: string;
  hebrew: string;
  description: string;
}

/** Display order matches the flow of the halachic day. */
export const ZMAN_DEFS: ZmanDef[] = [
  { key: "alos",          label: "Dawn",            hebrew: "עלות השחר",          description: "Alter Rebbe — 16.9° below horizon (72 zmanis min before hanetz amiti)" },
  { key: "misheyakir",    label: "Earliest Talis",  hebrew: "זמן ציצית ותפילין",  description: "Misheyakir — 10.2° below horizon (Beis Baruch / Birur Halocho)" },
  { key: "sunrise",       label: "Sunrise",         hebrew: "הנץ החמה",           description: "Sea-level sunrise (90.833°)" },
  { key: "sofZmanShema",  label: "Latest Shema",    hebrew: "סוף זמן קריאת שמע",  description: "Alter Rebbe — 3 shaos zmanios of the hanetz-amiti day" },
  { key: "sofZmanTefila", label: "Latest Shachris", hebrew: "סוף זמן תפילה",      description: "Alter Rebbe — 4 shaos zmanios of the hanetz-amiti day" },
  { key: "chatzos",       label: "Midday",          hebrew: "חצות היום",          description: "Midpoint of the halachic day" },
  { key: "minchaGedola",  label: "Earliest Mincha", hebrew: "מנחה גדולה",         description: "Alter Rebbe — 6.5 shaos zmanios" },
  { key: "minchaKetana",  label: "Mincha Ketana",   hebrew: "מנחה קטנה",          description: "Alter Rebbe — 9.5 shaos zmanios" },
  { key: "plagHamincha",  label: "Plag HaMincha",   hebrew: "פלג המנחה",          description: "Alter Rebbe — 10.75 shaos zmanios" },
  { key: "sunset",        label: "Sunset",          hebrew: "שקיעת החמה",         description: "Sea-level sunset (90.833°)" },
  { key: "tzeis",         label: "Nightfall",       hebrew: "צאת הכוכבים",        description: "Chabad — 3 medium stars, 6° below horizon (~24 min)" },
  { key: "tzeis72",       label: "Rabeinu Tam",     hebrew: "ר״ת — 72 דקות", description: "72 fixed minutes after sea-level shkia" },
  { key: "midnight",      label: "Midnight",        hebrew: "חצות הלילה",         description: "Midpoint of shkia and next hanetz" },
];

export const DEFAULT_ZMANIM: ZmanKey[] = ZMAN_DEFS.map((z) => z.key).filter(
  (k) => k !== "tzeis72" && k !== "minchaKetana"
);

export type DayZmanim = Partial<Record<ZmanKey, number | null>>;

/**
 * All zmanim for one location and one UTC day (identified by its 00:00 UTC ms).
 * Values are UTC ms or null (sun never reaches the angle — polar regions).
 */
export function zmanimForDay(dayStartMs: number, lat: number, lon: number): DayZmanim {
  const rise = (zenith: number) => sunEventUtc(dayStartMs, lat, lon, zenith, true);
  const set = (zenith: number) => sunEventUtc(dayStartMs, lat, lon, zenith, false);

  const netzAmiti = rise(ZENITH_AMITI);
  const shkiaAmiti = set(ZENITH_AMITI);
  const sunrise = rise(ZENITH_SEA_LEVEL);
  const sunset = set(ZENITH_SEA_LEVEL);

  let sofZmanShema: number | null = null;
  let sofZmanTefila: number | null = null;
  let chatzos: number | null = null;
  let minchaGedola: number | null = null;
  let minchaKetana: number | null = null;
  let plagHamincha: number | null = null;

  if (netzAmiti != null && shkiaAmiti != null && shkiaAmiti > netzAmiti) {
    const shaah = (shkiaAmiti - netzAmiti) / 12;
    sofZmanShema = netzAmiti + 3 * shaah;
    sofZmanTefila = netzAmiti + 4 * shaah;
    chatzos = netzAmiti + 6 * shaah;
    minchaGedola = netzAmiti + 6.5 * shaah;
    minchaKetana = netzAmiti + 9.5 * shaah;
    plagHamincha = netzAmiti + 10.75 * shaah;
  }

  // Chatzos halailah: midpoint of tonight's shkia and tomorrow's hanetz
  let midnight: number | null = null;
  const nextSunrise = sunEventUtc(dayStartMs + 86_400_000, lat, lon, ZENITH_SEA_LEVEL, true);
  if (sunset != null && nextSunrise != null) {
    midnight = Math.round((sunset + nextSunrise) / 2);
  }

  return {
    alos: rise(ZENITH_ALOS_BH),
    misheyakir: rise(ZENITH_MISHEYAKIR),
    sunrise,
    sofZmanShema,
    sofZmanTefila,
    chatzos,
    minchaGedola,
    minchaKetana,
    plagHamincha,
    sunset,
    tzeis: set(ZENITH_TZEIS_BH),
    tzeis72: sunset != null ? sunset + 72 * 60_000 : null,
    midnight,
  };
}

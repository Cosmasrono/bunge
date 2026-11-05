/**
 * Time-zone helpers with no extra libraries.
 * "Wall time" = what a clock on the wall shows in a given zone, as "YYYY-MM-DDTHH:mm".
 */
import type { Repeat } from "@/db/schema";

export const DEFAULT_TZ = process.env.APP_TIMEZONE || "Africa/Nairobi";
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

type Parts = { y: number; m: number; d: number; h: number; mi: number };

function partsInZone(date: Date, tz: string): Parts & { s: number } {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(f.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

/** Wall time as a plain number (ms) for date arithmetic — not a real instant. */
function wallMs(p: Parts) {
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
}

function msToParts(ms: number): Parts {
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}

export function parseWall(local: string): Parts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const p = { y: +m[1], m: +m[2], d: +m[3], h: +m[4], mi: +m[5] };
  const check = msToParts(wallMs(p));
  if (check.y !== p.y || check.m !== p.m || check.d !== p.d || p.h > 23 || p.mi > 59) return null;
  return p;
}

function offsetMs(instant: number, tz: string) {
  const p = partsInZone(new Date(instant), tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(instant / 1000) * 1000;
}

/** Converts a wall time in `tz` to the exact instant. */
export function wallToUtc(p: Parts, tz: string): Date {
  const guess = wallMs(p);
  const off1 = offsetMs(guess, tz);
  let utc = guess - off1;
  const off2 = offsetMs(utc, tz);
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

export function localStringToUtc(local: string, tz: string): Date | null {
  const p = parseWall(local);
  return p ? wallToUtc(p, tz) : null;
}

export function utcToWall(date: Date, tz: string): Parts {
  const { y, m, d, h, mi } = partsInZone(date, tz);
  return { y, m, d, h, mi };
}

function addMonths(p: Parts, n: number): Parts {
  const total = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { ...p, y, m, d: Math.min(p.d, lastDay) };
}

/**
 * The first occurrence of an event strictly after `after`, or null if it never happens again.
 * Repeats are calculated on the wall clock, so "9:00 every day" stays 9:00.
 */
export function nextOccurrence(
  ev: { startLocal: string; timezone: string; repeat: Repeat },
  after: Date,
): Date | null {
  const start = parseWall(ev.startLocal);
  if (!start) return null;
  const tz = ev.timezone;
  const first = wallToUtc(start, tz);
  if (ev.repeat === "none") return first > after ? first : null;
  if (first > after && ev.repeat !== "weekdays") return first;

  const afterWall = wallMs(utcToWall(after, tz));
  const startWall = wallMs(start);

  if (ev.repeat === "monthly") {
    const a = msToParts(afterWall);
    let n = Math.max(0, (a.y - start.y) * 12 + (a.m - start.m) - 1);
    for (let i = 0; i < 40; i++, n++) {
      const occ = wallToUtc(addMonths(start, n), tz);
      if (occ > after) return occ;
    }
    return null;
  }

  const step = ev.repeat === "weekly" ? 7 * DAY : DAY;
  let n = Math.max(0, Math.floor((afterWall - startWall) / step) - 1);
  for (let i = 0; i < 400; i++, n++) {
    const wall = startWall + n * step;
    if (ev.repeat === "weekdays") {
      const dow = new Date(wall).getUTCDay();
      if (dow === 0 || dow === 6) continue;
    }
    const occ = wallToUtc(msToParts(wall), tz);
    if (occ > after) return occ;
  }
  return null;
}

// ----------------------------------------------------------------- formatting
export function formatWhen(date: Date, tz: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...opts,
  }).format(date);
}

export function formatTime(date: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(date);
}

/** "Today", "Tomorrow", or "Friday 7 Nov" in the given zone. */
export function dayLabel(date: Date, tz: string, now = new Date()) {
  const key = (d: Date) => {
    const p = utcToWall(d, tz);
    return Date.UTC(p.y, p.m - 1, p.d);
  };
  const diff = Math.round((key(date) - key(now)) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "short",
    ...(utcToWall(date, tz).y !== utcToWall(now, tz).y ? { year: "numeric" } : {}),
  }).format(date);
}

export function dayKey(date: Date, tz: string) {
  const p = utcToWall(date, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function humanUntil(ms: number) {
  const mins = Math.round(ms / MIN);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rest = mins % 60;
    return `in ${hours} hr${hours > 1 ? "s" : ""}${rest ? ` ${rest} min` : ""}`;
  }
  const days = Math.floor(hours / 24);
  const restH = hours % 24;
  return `in ${days} day${days > 1 ? "s" : ""}${restH ? ` ${restH} hr${restH > 1 ? "s" : ""}` : ""}`;
}

export const LEAD_OPTIONS: { minutes: number; label: string; short: string }[] = [
  { minutes: 1440, label: "1 day before", short: "1 day" },
  { minutes: 300, label: "5 hours before", short: "5 hrs" },
  { minutes: 60, label: "1 hour before", short: "1 hr" },
  { minutes: 15, label: "15 minutes before", short: "15 min" },
  { minutes: 0, label: "At start time", short: "At start" },
];

export function leadLabel(minutes: number) {
  return LEAD_OPTIONS.find((o) => o.minutes === minutes)?.short ?? `${minutes} min`;
}

export const REPEAT_LABELS: Record<Repeat, string> = {
  none: "Does not repeat",
  daily: "Every day",
  weekdays: "Every weekday (Mon–Fri)",
  weekly: "Every week",
  monthly: "Every month",
};

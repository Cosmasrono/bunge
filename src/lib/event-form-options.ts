import { REPEAT_OPTIONS } from "@/db/schema";
import { LEAD_OPTIONS, REPEAT_LABELS, utcToWall } from "./time";

const pad = (n: number) => String(n).padStart(2, "0");

/** Shared options for the add/edit event form, computed in the user's time zone. */
export function eventFormOptions(tz: string, now = new Date()) {
  const today = utcToWall(now, tz);
  const base = Date.UTC(today.y, today.m - 1, today.d);
  const iso = (ms: number) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };
  const DAY = 86_400_000;
  const dow = new Date(base).getUTCDay();
  const toMonday = ((8 - dow) % 7) || 7;
  return {
    leadOptions: LEAD_OPTIONS.map(({ minutes, label }) => ({ minutes, label })),
    repeatOptions: REPEAT_OPTIONS.map((value) => ({ value, label: REPEAT_LABELS[value] })),
    quickDates: [
      { label: "Today", date: iso(base) },
      { label: "Tomorrow", date: iso(base + DAY) },
      { label: "Next Monday", date: iso(base + toMonday * DAY) },
    ],
    defaults: (() => {
      // The next full hour, rolling over to tomorrow after 11 pm.
      const next = utcToWall(new Date(now.getTime() + 3_600_000), tz);
      return { date: `${next.y}-${pad(next.m)}-${pad(next.d)}`, time: `${pad(next.h)}:00` };
    })(),
  };
}

import "server-only";
import { getDb, isObjectId } from "@/db";
import type { EventRow } from "@/db/schema";
import { nextOccurrence } from "./time";

export type ScheduleItem = EventRow & { next: Date | null };

/** All of a user's events with their next occurrence, soonest first. */
export async function getSchedule(userId: string, now = new Date()) {
  const rows = await getDb().event.findMany({ where: { userId } });
  const items: ScheduleItem[] = rows.map((e) => ({ ...e, next: nextOccurrence(e, now) }));
  const upcoming = items.filter((i) => i.next).sort((a, b) => a.next!.getTime() - b.next!.getTime());
  const past = items
    .filter((i) => !i.next)
    .sort((a, b) => b.startUtc.getTime() - a.startUtc.getTime())
    .slice(0, 30);
  return { upcoming, past };
}

/** One event, only if it belongs to this user. */
export async function getOwnEvent(userId: string, eventId: string) {
  if (!isObjectId(eventId) || !isObjectId(userId)) return null;
  return getDb().event.findFirst({ where: { id: eventId, userId } });
}

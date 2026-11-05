import "server-only";
import { getDb, isObjectId } from "@/db";
import type { EventRow } from "@/db/schema";
import { nextOccurrence } from "./time";

export type ScheduleItem = EventRow & { next: Date | null; /** Name of the admin who added it to this person's schedule, if not themselves. */ addedBy: string | null };

/** All of a person's events with their next occurrence, soonest first. */
export async function getSchedule(userId: string, now = new Date()) {
  const db = getDb();
  const rows = await db.event.findMany({ where: { userId } });
  const otherIds = [...new Set(rows.map((r) => r.createdById).filter((id): id is string => Boolean(id) && id !== userId))];
  const names = new Map(
    otherIds.length ? (await db.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]) : [],
  );
  const items: ScheduleItem[] = rows.map((e) => ({
    ...e,
    next: nextOccurrence(e, now),
    addedBy: e.createdById && e.createdById !== userId ? (names.get(e.createdById) ?? "an admin") : null,
  }));
  const upcoming = items.filter((i) => i.next).sort((a, b) => a.next!.getTime() - b.next!.getTime());
  const past = items
    .filter((i) => !i.next)
    .sort((a, b) => b.startUtc.getTime() - a.startUtc.getTime())
    .slice(0, 30);
  return { upcoming, past };
}

/** One event: your own, or (for admins) anyone's. */
export async function getEventFor(viewer: { id: string; role: string }, eventId: string) {
  if (!isObjectId(eventId) || !isObjectId(viewer.id)) return null;
  return getDb().event.findFirst({
    where: viewer.role === "admin" ? { id: eventId } : { id: eventId, userId: viewer.id },
    include: { user: { select: { id: true, name: true } } },
  });
}

/** Everyone except the viewer, for admins who add events to other people's schedules. */
export async function listPeople(exceptUserId: string) {
  return getDb().user.findMany({
    where: { id: { not: exceptUserId } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, timezone: true },
  });
}

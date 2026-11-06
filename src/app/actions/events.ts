"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, isObjectId } from "@/db";
import { REPEAT_OPTIONS } from "@/db/schema";
import { allowAttempt } from "@/lib/auth/request";
import { canScheduleForOthers } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { mailConfigured, sendEmail, APP_URL } from "@/lib/mail";
import { notifyUser } from "@/lib/notify";
import { formatWhen, LEAD_OPTIONS, localStringToUtc, utcToWall } from "@/lib/time";
import type { FormState } from "./auth";

const ALLOWED_LEADS = new Set(LEAD_OPTIONS.map((o) => o.minutes));

const eventSchema = z.object({
  title: z.string().trim().min(1, "Give the event a title.").max(150),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time."),
  repeat: z.enum(REPEAT_OPTIONS),
  location: z.string().trim().max(200),
  notes: z.string().trim().max(2000),
});

function readForm(form: FormData) {
  const fields = {
    title: String(form.get("title") ?? ""),
    date: String(form.get("date") ?? ""),
    time: String(form.get("time") ?? ""),
    repeat: String(form.get("repeat") ?? "none"),
    location: String(form.get("location") ?? ""),
    notes: String(form.get("notes") ?? ""),
  };
  const leads = [...new Set(form.getAll("leads").map(Number))].filter((n) => ALLOWED_LEADS.has(n));
  const emailReminders = form.get("emailReminders") === "on";
  return { fields, leads, emailReminders };
}

async function validate(form: FormData, timezone: string) {
  const { fields, leads, emailReminders } = readForm(form);
  const parsed = eventSchema.safeParse(fields);
  const keep = { ...fields, leads: leads.join(","), emailReminders: emailReminders ? "on" : "" };
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: keep } as const;
  const startLocal = `${parsed.data.date}T${parsed.data.time}`;
  const startUtc = localStringToUtc(startLocal, timezone);
  if (!startUtc) return { error: "That date or time isn't valid.", fields: keep } as const;
  if (emailReminders && !leads.length) return { error: "Choose at least one reminder time, or turn reminders off.", fields: keep } as const;
  return {
    data: {
      title: parsed.data.title,
      location: parsed.data.location,
      notes: parsed.data.notes,
      repeat: parsed.data.repeat,
      startLocal,
      startUtc,
      timezone,
      leads: leads.sort((a, b) => b - a),
      emailReminders,
    },
  } as const;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The same moment as a wall-clock time in another time zone, for that person's copy of an event. */
function wallFor(startUtc: Date, timezone: string) {
  const w = utcToWall(startUtc, timezone);
  return { startLocal: `${w.y}-${pad(w.m)}-${pad(w.d)}T${pad(w.h)}:${pad(w.mi)}`, timezone };
}

/** "Whose schedule?" choices that add the event for many people at once. */
const EVENT_GROUPS = { all: "Everyone", directors: "All directors", staff: "All staff" } as const;
type Group = keyof typeof EVENT_GROUPS;
const isGroup = (v: string): v is Group => v in EVENT_GROUPS;

/** Tells someone an event was put on their schedule by someone else (pop-up, push and email). */
async function tellAdded(
  by: { name: string },
  person: { id: string; name: string; email: string; timezone: string },
  event: { id: string; title: string; startUtc: Date; location: string },
) {
  const when = formatWhen(event.startUtc, person.timezone, { weekday: "long", year: "numeric" });
  const details: [string, string][] = [["When", when]];
  if (event.location) details.push(["Where", event.location]);
  await notifyUser(
    person.id,
    { title: `${by.name} added "${event.title}" to your schedule`, body: [when, event.location].filter(Boolean).join(" · "), url: `/events/${event.id}`, tag: `event-${event.id}` },
    {
      to: person.email,
      subject: `New on your schedule: ${event.title}`,
      content: {
        heading: "Added to your schedule",
        lines: [`Hi ${person.name.split(" ")[0]}, ${by.name} added "${event.title}" to your schedule. You will get the usual reminders before it starts.`],
        details,
        button: { text: "Open my schedule", url: `${APP_URL}/events/${event.id}` },
      },
    },
  );
}

/** Adds one event to every person in a group: one copy each, at the same moment, each in their own time zone. */
async function createForGroup(user: { id: string; name: string; timezone: string }, group: Group, form: FormData): Promise<FormState> {
  const db = getDb();
  // The time is entered in the creator's time zone; each copy shows the same moment in its owner's zone.
  const v = await validate(form, user.timezone);
  if ("error" in v) return { error: v.error, fields: { ...v.fields, forUserId: group } };
  const people = await db.user.findMany({
    where: group === "all" ? {} : { role: group === "directors" ? "director" : "staff" },
    select: { id: true, name: true, email: true, timezone: true },
  });
  if (!people.length) return { error: `Nobody is in "${EVENT_GROUPS[group]}" yet.`, fields: { ...readForm(form).fields, forUserId: group } };
  if (!(await allowAttempt(`groupevent:${user.id}`, 20, 3600))) {
    return { error: "You have added a lot of group events. Please wait a while.", fields: { ...readForm(form).fields, forUserId: group } };
  }

  const batchId = randomBytes(12).toString("hex");
  const created: { person: (typeof people)[number]; id: string }[] = [];
  for (const person of people) {
    const event = await db.event.create({
      data: { ...v.data, ...wallFor(v.data.startUtc, person.timezone), userId: person.id, createdById: user.id, batchId },
      select: { id: true },
    });
    created.push({ person, id: event.id });
  }
  await Promise.all(
    created
      .filter((c) => c.person.id !== user.id)
      .map((c) => tellAdded(user, c.person, { id: c.id, title: v.data.title, startUtc: v.data.startUtc, location: v.data.location })),
  );
  revalidatePath("/");
  redirect(`/?saved=1&added=${created.length}`);
}

export async function createEvent(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const forUserId = String(form.get("forUserId") ?? "");
  if (isGroup(forUserId)) {
    if (!canScheduleForOthers(user)) return { error: "You don't have permission to add events for other people." };
    return createForGroup(user, forUserId, form);
  }
  // People allowed to schedule for others can add an event to someone else's schedule; that person gets the reminders.
  let owner = { id: user.id, name: user.name, email: user.email, timezone: user.timezone };
  if (canScheduleForOthers(user) && forUserId && forUserId !== user.id) {
    const target = isObjectId(forUserId) ? await getDb().user.findUnique({ where: { id: forUserId }, select: { id: true, name: true, email: true, timezone: true } }) : null;
    if (!target) return { error: "That person no longer has an account.", fields: { forUserId } };
    owner = target;
  }
  const v = await validate(form, owner.timezone);
  if ("error" in v) return { error: v.error, fields: { ...v.fields, forUserId } };
  const event = await getDb().event.create({ data: { ...v.data, userId: owner.id, createdById: user.id }, select: { id: true } });
  if (owner.id !== user.id) await tellAdded(user, owner, { id: event.id, title: v.data.title, startUtc: v.data.startUtc, location: v.data.location });
  revalidatePath("/");
  redirect(owner.id === user.id ? "/?saved=1" : `/?for=${owner.id}&saved=1`);
}

export async function updateEvent(eventId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isObjectId(eventId)) return { error: "That event no longer exists." };
  const db = getDb();
  // Admins may edit anyone's events; everyone else only their own.
  const scope = canScheduleForOthers(user) ? { id: eventId } : { id: eventId, userId: user.id };
  const existing = await db.event.findFirst({ where: scope });
  if (!existing) return { error: "That event no longer exists." };
  // Keep the event's own time zone when editing.
  const v = await validate(form, existing.timezone);
  if ("error" in v) return { error: v.error, fields: v.fields };

  // "Apply to everyone": change every copy of a group event. Each person keeps their own reminder choices.
  if (form.get("applyToAll") === "on" && existing.batchId && canScheduleForOthers(user)) {
    const copies = await db.event.findMany({ where: { batchId: existing.batchId }, select: { id: true, timezone: true, startLocal: true, repeat: true } });
    const shared = { title: v.data.title, location: v.data.location, notes: v.data.notes, repeat: v.data.repeat, startUtc: v.data.startUtc };
    for (const copy of copies) {
      const when = wallFor(v.data.startUtc, copy.timezone);
      await db.event.update({ where: { id: copy.id }, data: { ...shared, ...when, updatedAt: new Date() } });
      if (copy.startLocal !== when.startLocal || copy.repeat !== v.data.repeat) await db.reminderSent.deleteMany({ where: { eventId: copy.id } });
    }
    revalidatePath("/");
    redirect(existing.userId === user.id ? "/?saved=1" : `/?for=${existing.userId}&saved=1`);
  }

  await db.event.updateMany({ where: scope, data: { ...v.data, updatedAt: new Date() } });
  // The time may have changed, so allow its reminders to go out again.
  if (existing.startLocal !== v.data.startLocal || existing.repeat !== v.data.repeat) {
    await db.reminderSent.deleteMany({ where: { eventId } });
  }
  revalidatePath("/");
  redirect(existing.userId === user.id ? "/?saved=1" : `/?for=${existing.userId}&saved=1`);
}

export async function deleteEvent(eventId: string) {
  const user = await requireUser();
  let back = "/?deleted=1";
  if (isObjectId(eventId)) {
    const db = getDb();
    const scope = canScheduleForOthers(user) ? { id: eventId } : { id: eventId, userId: user.id };
    const existing = await db.event.findFirst({ where: scope, select: { userId: true } });
    if (existing) {
      await db.event.deleteMany({ where: scope });
      // Also clear its sent-markers directly instead of relying on Prisma's emulated cascade.
      await db.reminderSent.deleteMany({ where: { eventId } });
      if (existing.userId !== user.id) back = `/?for=${existing.userId}&deleted=1`;
    }
  }
  revalidatePath("/");
  redirect(back);
}

/** Deletes every copy of a group event ("Everyone") and tells the people it was removed. */
export async function deleteEventForAll(eventId: string) {
  const user = await requireUser();
  if (!isObjectId(eventId) || !canScheduleForOthers(user)) redirect("/");
  const db = getDb();
  const event = await db.event.findUnique({ where: { id: eventId }, select: { batchId: true, title: true } });
  if (!event?.batchId) redirect("/");
  const copies = await db.event.findMany({ where: { batchId: event.batchId }, select: { id: true, userId: true } });
  await db.event.deleteMany({ where: { batchId: event.batchId } });
  await db.reminderSent.deleteMany({ where: { eventId: { in: copies.map((c) => c.id) } } });
  await Promise.all(
    copies
      .filter((c) => c.userId !== user.id)
      .map((c) => notifyUser(c.userId, { title: `"${event.title}" was cancelled`, body: `${user.name} removed it from your schedule.`, url: "/", tag: `event-${c.id}` })),
  );
  revalidatePath("/");
  redirect("/?deleted=1");
}

export async function sendTestEmail(_prev: FormState): Promise<FormState> {
  void _prev;
  const user = await requireUser();
  if (!mailConfigured()) return { error: "Email isn't set up yet. Add the SMTP settings first." };
  if (!(await allowAttempt(`testmail:${user.id}`, 5, 3600))) return { error: "Too many test emails. Try again in an hour." };
  try {
    await sendEmail(user.email, "Test email — your reminders are working", {
      heading: "It works!",
      lines: [`Hi ${user.name.split(" ")[0]}, your schedule reminders will arrive at this address.`],
      button: { text: "Open my schedule", url: `${APP_URL}/` },
    });
    return { ok: `Test email sent to ${user.email}. Check your inbox.` };
  } catch (err) {
    return { error: `Couldn't send: ${(err as Error).message}` };
  }
}

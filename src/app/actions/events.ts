"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, isObjectId } from "@/db";
import { REPEAT_OPTIONS } from "@/db/schema";
import { allowAttempt } from "@/lib/auth/request";
import { canScheduleForOthers } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { mailConfigured, sendEmail, APP_URL } from "@/lib/mail";
import { LEAD_OPTIONS, localStringToUtc } from "@/lib/time";
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

export async function createEvent(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  // Admins can add an event to someone else's schedule; they get the reminders.
  let owner = { id: user.id, timezone: user.timezone };
  const forUserId = String(form.get("forUserId") ?? "");
  if (canScheduleForOthers(user) && forUserId && forUserId !== user.id) {
    const target = isObjectId(forUserId) ? await getDb().user.findUnique({ where: { id: forUserId }, select: { id: true, timezone: true } }) : null;
    if (!target) return { error: "That person no longer has an account.", fields: { forUserId } };
    owner = target;
  }
  const v = await validate(form, owner.timezone);
  if ("error" in v) return { error: v.error, fields: { ...v.fields, forUserId } };
  await getDb().event.create({ data: { ...v.data, userId: owner.id, createdById: user.id } });
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

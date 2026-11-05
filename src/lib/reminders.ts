import { getDb, isUniqueViolation } from "@/db";
import type { EventRow } from "@/db/schema";
import { APP_URL, mailConfigured, sendEmail } from "./mail";
import { formatWhen, humanUntil, leadLabel, nextOccurrence, REPEAT_LABELS } from "./time";

const MIN = 60_000;
/** How late an "at start time" reminder may still go out (e.g. if a run was delayed). */
const START_GRACE = 10 * MIN;

type Result = { checked: number; sent: number; failed: number; errors: string[] };

/**
 * Sends every reminder that is due and hasn't been sent yet.
 * Safe to call as often as you like (every minute is ideal) and safe to run in
 * parallel: each reminder is "claimed" in the database before it is emailed.
 *
 * If several reminders for the same occurrence are due at once (say the
 * server was asleep), only ONE email goes out — the most recent one.
 */
export async function runDueReminders(now = new Date()): Promise<Result> {
  const db = getDb();
  const result: Result = { checked: 0, sent: 0, failed: 0, errors: [] };
  if (!mailConfigured()) {
    result.errors.push("Email is not configured");
    await saveStatus(now, result);
    return result;
  }

  const windowStart = new Date(now.getTime() - START_GRACE);
  const events = await db.event.findMany({
    where: {
      emailReminders: true,
      OR: [{ repeat: { not: "none" } }, { startUtc: { gt: windowStart } }],
    },
    include: { user: { select: { email: true, name: true } } },
  });

  for (const { user, ...event } of events) {
    const { email, name } = user;
    result.checked++;
    if (!event.leads.length) continue;
    // The occurrence that may have just started (for "at start" reminders)
    // and the next upcoming one (for "before" reminders).
    const occurrences = new Map<number, Date>();
    for (const after of [windowStart, now]) {
      const occ = nextOccurrence(event, after);
      if (occ) occurrences.set(occ.getTime(), occ);
    }
    for (const occ of occurrences.values()) {
      const due = event.leads.filter((lead) => {
        const remindAt = occ.getTime() - lead * MIN;
        if (remindAt > now.getTime()) return false; // not yet
        return lead === 0 ? true : occ.getTime() > now.getTime(); // "before" reminders only before it starts
      });
      if (!due.length) continue;

      // Claim first, so a parallel run can't send the same reminder:
      // the unique index on (eventId, occurrence, lead) lets only one run insert each marker.
      const claimed: number[] = [];
      for (const lead of due) {
        try {
          await db.reminderSent.create({ data: { eventId: event.id, occurrence: occ, lead } });
          claimed.push(lead);
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
        }
      }
      if (!claimed.length) continue;

      const lead = Math.min(...claimed);
      try {
        await sendReminderEmail(event, occ, lead, now, email, name);
        result.sent++;
      } catch (err) {
        // Release the claim so the next run tries again.
        await db.reminderSent.deleteMany({
          where: { eventId: event.id, occurrence: occ, lead: { in: claimed } },
        });
        result.failed++;
        result.errors.push(`${event.title}: ${(err as Error).message}`);
        console.error("[reminders] send failed", event.id, err);
      }
    }
  }

  // Housekeeping: forget sent-markers older than 60 days.
  await db.reminderSent.deleteMany({ where: { occurrence: { lt: new Date(now.getTime() - 60 * 86_400_000) } } });
  await saveStatus(now, result);
  return result;
}

async function sendReminderEmail(event: EventRow, occ: Date, lead: number, now: Date, to: string, name: string) {
  const tz = event.timezone;
  const startsNow = lead === 0 || occ.getTime() <= now.getTime();
  const when = formatWhen(occ, tz, { weekday: "long", year: "numeric" });
  const until = startsNow ? "now" : humanUntil(occ.getTime() - now.getTime());
  const subject = startsNow ? `Starting now: ${event.title}` : `Reminder: ${event.title} — ${until}`;
  const details: [string, string][] = [["When", when]];
  if (event.location) details.push(["Where", event.location]);
  if (event.repeat !== "none") details.push(["Repeats", REPEAT_LABELS[event.repeat]]);
  if (event.notes) details.push(["Notes", event.notes]);
  await sendEmail(to, subject, {
    heading: startsNow ? `${event.title} is starting now` : `${event.title} starts ${until}`,
    lines: [`Hi ${name.split(" ")[0]}, this is your ${startsNow ? "start-time" : leadLabel(lead) + " before"} reminder.`],
    details,
    button: { text: "Open my schedule", url: `${APP_URL}/` },
    footer: "You can change or turn off reminders for this event in your schedule.",
  });
}

async function saveStatus(now: Date, result: Result) {
  const value = JSON.stringify({ at: now.toISOString(), sent: result.sent, failed: result.failed, errors: result.errors.slice(0, 3) });
  await getDb().appState.upsert({
    where: { key: "reminders_last_run" },
    create: { key: "reminders_last_run", value },
    update: { value, updatedAt: now },
  });
}

export async function lastReminderRun() {
  const row = await getDb().appState.findUnique({ where: { key: "reminders_last_run" } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as { at: string; sent: number; failed: number; errors: string[] };
  } catch {
    return null;
  }
}

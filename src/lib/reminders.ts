import { getDb, isUniqueViolation } from "@/db";
import type { EventRow } from "@/db/schema";
import { APP_URL, mailConfigured, sendEmail } from "./mail";
import { pushConfigured, sendPushToUser } from "./push";
import { formatWhen, humanUntil, leadLabel, nextOccurrence, REPEAT_LABELS } from "./time";

const MIN = 60_000;
/** How late an "at start time" reminder may still go out (e.g. if a run was delayed). */
const START_GRACE = 10 * MIN;

type Result = { checked: number; sent: number; failed: number; errors: string[] };

/**
 * Sends every reminder that is due and hasn't been sent yet, to the person whose schedule the event is on.
 * Each reminder goes out as a push notification to every device they turned notifications on for, and as an
 * email (the backup, and the only channel for people with no device set up).
 * Safe to call as often as you like (every minute is ideal) and safe to run in parallel: each reminder is
 * "claimed" in the database (a unique marker) before anything is sent, so it can't go out twice.
 *
 * If several reminders for the same occurrence are due at once (say the server was asleep), only ONE
 * message goes out: the most recent one.
 */
export async function runDueReminders(now = new Date()): Promise<Result> {
  const db = getDb();
  const result: Result = { checked: 0, sent: 0, failed: 0, errors: [] };
  const emailOn = mailConfigured();
  const pushOn = pushConfigured();
  if (!emailOn && !pushOn) {
    result.errors.push("Neither email nor push notifications are configured");
    await saveStatus(now, result);
    return result;
  }

  // Who has at least one device with notifications on.
  const pushUsers = pushOn
    ? new Set((await db.pushSubscription.findMany({ select: { userId: true } })).map((s) => s.userId))
    : new Set<string>();

  const windowStart = new Date(now.getTime() - START_GRACE);
  const events = await db.event.findMany({
    where: {
      emailReminders: true, // the "Reminders" switch on the event
      OR: [{ repeat: { not: "none" } }, { startUtc: { gt: windowStart } }],
    },
    include: { user: { select: { email: true, name: true } } },
  });

  for (const { user, ...event } of events) {
    const { email, name } = user;
    result.checked++;
    if (!event.leads.length) continue;
    const viaEmail = emailOn;
    const viaPush = pushUsers.has(event.userId);
    // Nowhere to send it: leave it unclaimed, so it still goes out if a channel is set up in time.
    if (!viaEmail && !viaPush) continue;

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
      const message = buildMessage(event, occ, lead, now);
      const failures: string[] = [];
      let delivered = false;

      if (viaPush) {
        try {
          const r = await sendPushToUser(event.userId, {
            title: message.pushTitle,
            body: message.pushBody,
            url: `/events/${event.id}`,
            tag: `${event.id}:${occ.getTime()}`,
          });
          if (r.sent > 0) delivered = true;
          else if (r.failed > 0) failures.push("push not delivered");
        } catch (err) {
          failures.push(`push: ${(err as Error).message}`);
        }
      }
      if (viaEmail) {
        try {
          await sendReminderEmail(event, message, lead, email, name);
          delivered = true;
        } catch (err) {
          failures.push(`email: ${(err as Error).message}`);
        }
      }

      if (delivered) {
        result.sent++;
        if (failures.length) result.errors.push(`${event.title}: ${failures.join("; ")}`);
      } else {
        // Nothing got through: release the claim so the next run tries again.
        await db.reminderSent.deleteMany({
          where: { eventId: event.id, occurrence: occ, lead: { in: claimed } },
        });
        result.failed++;
        result.errors.push(`${event.title}: ${failures.join("; ") || "no device or email to send to"}`);
        console.error("[reminders] send failed", event.id, failures);
      }
    }
  }

  // Housekeeping: forget sent-markers older than 60 days.
  await db.reminderSent.deleteMany({ where: { occurrence: { lt: new Date(now.getTime() - 60 * 86_400_000) } } });
  await saveStatus(now, result);
  return result;
}

function buildMessage(event: EventRow, occ: Date, lead: number, now: Date) {
  const startsNow = lead === 0 || occ.getTime() <= now.getTime();
  const when = formatWhen(occ, event.timezone, { weekday: "long", year: "numeric" });
  const until = startsNow ? "now" : humanUntil(occ.getTime() - now.getTime());
  return {
    startsNow,
    when,
    until,
    pushTitle: startsNow ? `Starting now: ${event.title}` : `${event.title} · ${until}`,
    pushBody: [formatWhen(occ, event.timezone, { weekday: "short" }), event.location].filter(Boolean).join(" · "),
  };
}

async function sendReminderEmail(event: EventRow, m: ReturnType<typeof buildMessage>, lead: number, to: string, name: string) {
  const subject = m.startsNow ? `Starting now: ${event.title}` : `Reminder: ${event.title} — ${m.until}`;
  const details: [string, string][] = [["When", m.when]];
  if (event.location) details.push(["Where", event.location]);
  if (event.repeat !== "none") details.push(["Repeats", REPEAT_LABELS[event.repeat]]);
  if (event.notes) details.push(["Notes", event.notes]);
  await sendEmail(to, subject, {
    heading: m.startsNow ? `${event.title} is starting now` : `${event.title} starts ${m.until}`,
    lines: [`Hi ${name.split(" ")[0]}, this is your ${m.startsNow ? "start-time" : leadLabel(lead) + " before"} reminder.`],
    details,
    button: { text: "Open my schedule", url: `${APP_URL}/events/${event.id}` },
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

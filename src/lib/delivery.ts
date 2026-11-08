import { getDb } from "@/db";
import { sendSms, smsConfigured, smsText } from "@/lib/sms";

/**
 * The record of whether each notification's email and SMS went out, shown to admins on Settings → Message log.
 * "sent" means the email server or MobileSasa accepted the message; it can't confirm it reached the person.
 */
export type ChannelStatus = "sent" | "failed" | "off" | "no_number" | "none";
export type ChannelResult = { status: ChannelStatus; error?: string };

const clip = (err: unknown) => String((err as Error)?.message ?? err).slice(0, 300);

/** Runs a send and reports how it went, so one failed channel never stops the others. */
export async function attempt(send: () => Promise<unknown>): Promise<ChannelResult> {
  try {
    await send();
    return { status: "sent" };
  } catch (err) {
    return { status: "failed", error: clip(err) };
  }
}

/** Sends the SMS for a notification, or says why it wasn't sent. Never throws. */
export async function deliverSms(user: { phone?: string | null }, title: string, body: string): Promise<ChannelResult> {
  if (!smsConfigured()) return { status: "off" };
  if (!user.phone) return { status: "no_number" };
  return attempt(() => sendSms(user.phone!, smsText(title, body)));
}

/** Saves the outcome of one notification. Never throws: the log must not break the thing it records. */
export async function logDelivery(entry: { userId: string; title: string; url: string; email: ChannelResult; sms: ChannelResult }) {
  await getDb()
    .messageLog.create({
      data: {
        userId: entry.userId,
        title: entry.title.slice(0, 150),
        url: entry.url,
        emailStatus: entry.email.status,
        emailError: entry.email.error,
        smsStatus: entry.sms.status,
        smsError: entry.sms.error,
      },
    })
    .catch((err) => console.error("[delivery] could not save the log entry", err));
}

/**
 * True if this notification already failed recently. Reminders that fail everywhere are retried every run, and
 * this stops each retry adding another line to the log.
 */
export async function failedRecently(userId: string, title: string) {
  const row = await getDb().messageLog.findFirst({
    where: { userId, title: title.slice(0, 150), emailStatus: { not: "sent" }, smsStatus: { not: "sent" }, createdAt: { gt: new Date(Date.now() - 30 * 60_000) } },
    select: { id: true },
  });
  return Boolean(row);
}

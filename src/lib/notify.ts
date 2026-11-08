import "server-only";
import type { Prisma } from "@prisma/client";
import { getDb } from "@/db";
import { mailConfigured, sendEmail } from "@/lib/mail";
import { sendPushToUser } from "@/lib/push";
import { attempt, deliverSms, logDelivery, type ChannelResult } from "@/lib/delivery";

type Email = { to: string; subject: string; content: Parameters<typeof sendEmail>[2] };

/**
 * Tells someone about something, four ways at once:
 *  - an in-app pop-up (a Notice, shown the next time any page of the app is open, within ~20 seconds),
 *  - a phone/computer pop-up on every device they turned notifications on for (Web Push),
 *  - an email, when one is given (the backup),
 *  - an SMS, when they saved a phone number and the server has SMS set up.
 * Whether the email and the SMS went out is recorded in the message log.
 * Never throws: the thing being announced has already happened, so a failed message must not undo it.
 */
export async function notifyUser(userId: string, notice: { title: string; body: string; url: string; tag?: string }, email?: Email) {
  await Promise.all([
    getDb()
      .notice.create({ data: { userId, title: notice.title.slice(0, 150), body: notice.body.slice(0, 500), url: notice.url } })
      .catch((err) => console.error("[notify] notice failed", err)),
    sendPushToUser(userId, notice).catch((err) => console.error("[notify] push failed", err)),
  ]);
  const [emailResult, smsResult] = await Promise.all([
    !email ? ({ status: "none" } as ChannelResult) : !mailConfigured() ? ({ status: "off" } as ChannelResult) : attempt(() => sendEmail(email.to, email.subject, email.content)),
    getDb()
      .user.findUnique({ where: { id: userId }, select: { phone: true } })
      .then((u) => deliverSms(u ?? {}, notice.title, notice.body))
      .catch((err): ChannelResult => ({ status: "failed", error: String(err?.message ?? err).slice(0, 300) })),
  ]);
  if (emailResult.status === "failed") console.error("[notify] email failed", emailResult.error);
  if (smsResult.status === "failed") console.error("[notify] SMS failed", smsResult.error);
  await logDelivery({ userId, title: notice.title, url: notice.url, email: emailResult, sms: smsResult });
}

/** Not read yet. In MongoDB a never-set field is missing, and `readAt: null` alone wouldn't match it. */
export const UNREAD = { OR: [{ readAt: null }, { readAt: { isSet: false } }] } satisfies Prisma.NoticeWhereInput;

/** Unread notices for the pop-ups, newest last. */
export async function unreadNotices(userId: string) {
  return getDb().notice.findMany({
    where: { userId, ...UNREAD },
    orderBy: { createdAt: "asc" },
    take: 10,
    select: { id: true, title: true, body: true, url: true, createdAt: true },
  });
}

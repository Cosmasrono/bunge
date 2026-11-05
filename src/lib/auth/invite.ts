import "server-only";
import { getDb } from "@/db";
import { APP_NAME, APP_URL, sendEmail } from "@/lib/mail";
import { randomToken, sha256 } from "./crypto";

export const INVITE_HOURS = 48;

export const ROLE_LABEL = { admin: "Admin", director: "Director" } as const;

/** Public self-sign-up is off by default: accounts are created by an admin. Set ALLOW_PUBLIC_SIGNUP=true to open it. */
export const signupOpen = () => process.env.ALLOW_PUBLIC_SIGNUP === "true";

/**
 * Emails a one-time "set your password" link (never a password). Any earlier unused link for this user stops
 * working. The link opens the normal /reset page, which sets the password and signs the person in.
 * `kind` only changes the wording and the page they land on: "invite" for a brand-new account.
 */
export async function sendSetPasswordLink(
  user: { id: string; name: string; email: string; role: keyof typeof ROLE_LABEL },
  invitedBy: { name: string },
  kind: "invite" | "reset",
) {
  const db = getDb();
  const token = randomToken(32);
  await db.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  const created = await db.passwordReset.create({
    data: { userId: user.id, tokenHash: sha256(token), purpose: kind, expiresAt: new Date(Date.now() + INVITE_HOURS * 3_600_000) },
    select: { id: true },
  });
  const first = user.name.split(" ")[0];
  try {
    if (kind === "invite") {
      await sendEmail(user.email, `You've been invited to ${APP_NAME}`, {
        heading: `Welcome to ${APP_NAME}`,
        lines: [
          `Hi ${first}, ${invitedBy.name} created a ${ROLE_LABEL[user.role].toLowerCase()} account for you.`,
          `Your sign-in email is ${user.email}. Choose your password with the button below; it signs you in straight away.`,
          `The link works once and expires in ${INVITE_HOURS} hours.`,
        ],
        button: { text: "Set my password", url: `${APP_URL}/reset/${token}` },
        footer: "If you weren't expecting this, you can ignore this email.",
      });
    } else {
      await sendEmail(user.email, `Choose a new ${APP_NAME} password`, {
        heading: "Choose a new password",
        lines: [
          `Hi ${first}, ${invitedBy.name} sent you a link to choose a new password.`,
          `The link works once and expires in ${INVITE_HOURS} hours.`,
        ],
        button: { text: "Choose a new password", url: `${APP_URL}/reset/${token}` },
        footer: "If you weren't expecting this, you can ignore this email.",
      });
    }
  } catch (err) {
    await db.passwordReset.delete({ where: { id: created.id } }).catch(() => {});
    throw err;
  }
}

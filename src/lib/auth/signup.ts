import "server-only";
import { randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { getDb, isObjectId } from "@/db";
import { APP_NAME, APP_URL, sendEmail } from "@/lib/mail";
import { DEFAULT_TZ } from "@/lib/time";
import { randomToken, safeEqual, sha256 } from "./crypto";

const isProd = process.env.NODE_ENV === "production";
const COOKIE = isProd ? "__Host-nd_signup" : "nd_signup";
export const CODE_MINUTES = 15;
export const MAX_ATTEMPTS = 5;
export const MAX_SENDS = 5;
export const RESEND_SECONDS = 60;

const hashCode = (pendingId: string, code: string) => sha256(`${pendingId}:${code}`);

export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  const shown = user.length <= 2 ? user[0] : user[0] + "•".repeat(Math.min(user.length - 2, 6)) + user[user.length - 1];
  return `${shown}@${domain}`;
}

async function emailExists(email: string) {
  return Boolean(await getDb().user.findUnique({ where: { email }, select: { id: true } }));
}

/** Sends either the code, or — if the email already has an account — a "you already have an account" notice. */
async function deliver(email: string, name: string, code: string | null) {
  const first = name.split(" ")[0] || "there";
  if (code) {
    await sendEmail(email, `${code} is your ${APP_NAME} verification code`, {
      heading: "Confirm your email",
      lines: [`Hi ${first}, enter this code to finish creating your account:`],
      code,
      footer: `The code expires in ${CODE_MINUTES} minutes. Never share it with anyone. If you didn't try to sign up, you can ignore this email.`,
    });
  } else {
    await sendEmail(email, `You already have a ${APP_NAME} account`, {
      heading: "You already have an account",
      lines: [
        "Someone (hopefully you) tried to sign up with this email address, but it already has an account.",
        "If you forgot your password, you can reset it. If this wasn't you, you can ignore this email.",
      ],
      button: { text: "Reset my password", url: `${APP_URL}/forgot` },
    });
  }
}

/**
 * Starts a sign-up: stores it as pending, emails a 6-digit code, and remembers
 * the pending sign-up in a short-lived, HttpOnly cookie.
 * If the email is already registered, it behaves exactly the same on screen
 * (so nobody can test which emails have accounts), but no code can ever match.
 */
export async function startSignup(input: { email: string; name: string; phone: string; passwordHash: string; role: "admin" | "staff" }) {
  const db = getDb();
  const exists = await emailExists(input.email);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

  // Only one pending sign-up per email.
  await db.pendingSignup.deleteMany({ where: { email: input.email } });
  const pending = await db.pendingSignup.create({
    data: {
      ...input,
      codeHash: "pending",
      expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000),
    },
    select: { id: true },
  });
  // For an existing account, store a hash of a random value no one knows.
  const codeHash = exists ? sha256(randomToken(32)) : hashCode(pending.id, code);
  await db.pendingSignup.update({ where: { id: pending.id }, data: { codeHash } });

  await deliver(input.email, input.name, exists ? null : code);

  (await cookies()).set(COOKIE, pending.id, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: CODE_MINUTES * 60 * 2,
  });
}

/** The pending sign-up for this browser, if any. */
export async function getPendingSignup() {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!isObjectId(id)) return null;
  return getDb().pendingSignup.findUnique({ where: { id } });
}

export async function clearPendingCookie() {
  (await cookies()).delete(COOKIE);
}

type VerifyResult =
  | { ok: true; user: { id: string } }
  | { ok: false; error: string; restart?: boolean };

/** Checks the code. On success creates the account and returns it. */
export async function verifySignupCode(code: string): Promise<VerifyResult> {
  const pending = await getPendingSignup();
  if (!pending) return { ok: false, error: "This sign-up has expired. Please start again.", restart: true };
  const db = getDb();
  if (pending.expiresAt < new Date()) {
    await db.pendingSignup.deleteMany({ where: { id: pending.id } });
    return { ok: false, error: "This code has expired. Send a new one.", restart: false };
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "Too many wrong codes. Send a new code to try again." };
  }
  // Count the attempt first (atomically), so parallel guesses can't skip the limit.
  const { count } = await db.pendingSignup.updateMany({
    where: { id: pending.id, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (!count) return { ok: false, error: "Too many wrong codes. Send a new code to try again." };
  const counted = await db.pendingSignup.findUnique({ where: { id: pending.id }, select: { attempts: true } });
  if (!counted) return { ok: false, error: "This sign-up has expired. Please start again.", restart: true };

  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6 || !safeEqual(hashCode(pending.id, clean), pending.codeHash)) {
    const left = MAX_ATTEMPTS - counted.attempts;
    return {
      ok: false,
      error: left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes. Send a new code to try again.",
    };
  }

  // Correct code: create the account.
  if (pending.role === "admin" && (await db.user.findFirst({ select: { id: true } }))) {
    // The admin set-up was already completed by someone else.
    await db.pendingSignup.deleteMany({ where: { id: pending.id } });
    return { ok: false, error: "Setup is already complete. Please sign in.", restart: true };
  }
  if (await emailExists(pending.email)) {
    await db.pendingSignup.deleteMany({ where: { id: pending.id } });
    return { ok: false, error: "This email already has an account. Please sign in.", restart: true };
  }
  const user = await db.user.create({
    data: { email: pending.email, name: pending.name, phone: pending.phone, passwordHash: pending.passwordHash, role: pending.role, timezone: DEFAULT_TZ },
    select: { id: true },
  });
  await db.pendingSignup.deleteMany({ where: { id: pending.id } });
  await clearPendingCookie();
  return { ok: true, user };
}

/** Sends a fresh code (new code, attempts reset). */
export async function resendSignupCode(): Promise<{ ok: boolean; message: string }> {
  const pending = await getPendingSignup();
  if (!pending) return { ok: false, message: "This sign-up has expired. Please start again." };
  const wait = RESEND_SECONDS - Math.floor((Date.now() - pending.lastSentAt.getTime()) / 1000);
  if (wait > 0) return { ok: false, message: `Please wait ${wait} seconds before asking for another code.` };
  if (pending.sends >= MAX_SENDS) return { ok: false, message: "Too many codes sent. Please start the sign-up again later." };

  const exists = await emailExists(pending.email);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await getDb().pendingSignup.update({
    where: { id: pending.id },
    data: {
      codeHash: exists ? sha256(randomToken(32)) : hashCode(pending.id, code),
      attempts: 0,
      sends: pending.sends + 1,
      lastSentAt: new Date(),
      expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000),
    },
  });
  await deliver(pending.email, pending.name, exists ? null : code);
  return { ok: true, message: `A new code is on its way to ${maskEmail(pending.email)}.` };
}

export async function prunePendingSignups() {
  await getDb().pendingSignup.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } } });
}

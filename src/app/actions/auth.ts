"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { checkPassword, hashPassword, passwordProblem, randomToken, sha256 } from "@/lib/auth/crypto";
import { allowAttempt, audit, clearAttempts, clientInfo } from "@/lib/auth/request";
import { findValidReset, UNUSED_RESET } from "@/lib/auth/reset";
import { resendSignupCode, startSignup, verifySignupCode } from "@/lib/auth/signup";
import {
  createSession,
  destroyCurrentSession,
  destroyOtherSessions,
  getCurrentUser,
  requireUser,
} from "@/lib/auth/session";
import { APP_NAME, APP_URL, mailConfigured, sendEmail } from "@/lib/mail";
import { signupOpen } from "@/lib/auth/invite";
import { DEFAULT_TZ, isValidTimeZone } from "@/lib/time";

export type FormState = { error?: string; ok?: string; fields?: Record<string, string> } | undefined;

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);

function safeNext(value: FormDataEntryValue | null) {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : "/";
}

// ------------------------------------------------------------------ sign in / out
export async function login(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ email, password: z.string().min(1).max(200) }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  const typedEmail = String(form.get("email") ?? "").slice(0, 200);
  if (!parsed.success) return { error: "Enter your email and password.", fields: { email: typedEmail } };

  const { ip } = await clientInfo();
  const emailKey = `login:email:${parsed.data.email}`;
  if (!(await allowAttempt(`login:ip:${ip}`, 30, 900)) || !(await allowAttempt(emailKey, 5, 900))) {
    return { error: "Too many sign-in attempts. Please wait 15 minutes and try again.", fields: { email: typedEmail } };
  }

  const db = getDb();
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const ok = await checkPassword(user?.passwordHash, parsed.data.password);
  if (!user || !ok) {
    if (user) await audit("sign_in_failed", user.id);
    return { error: "That email and password don't match.", fields: { email: typedEmail } };
  }

  await clearAttempts(emailKey);
  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit("signed_in", user.id);
  redirect(safeNext(form.get("next")));
}

export async function logout() {
  const user = await getCurrentUser();
  if (user) await audit("signed_out", user.id);
  await destroyCurrentSession();
  redirect("/login");
}

// ------------------------------------------------------------------ first-time setup
export async function setupAdmin(_: FormState, form: FormData): Promise<FormState> {
  const db = getDb();
  if ((await db.user.count()) > 0) redirect("/login");

  // The first account becomes the admin. Its email is confirmed with a 6-digit code like any sign-up.
  const fields = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") };
  const { ip } = await clientInfo();
  if (!(await allowAttempt(`setup:${ip}`, 10, 900))) return { error: "Too many attempts. Wait 15 minutes.", fields };

  return beginSignup(form, "admin");
}

// ------------------------------------------------------------------ sign up (with emailed code)
const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100),
  email,
  password: z.string().max(200),
});

/** Shared by public sign-up and first-time admin setup: validate, then email a code. */
async function beginSignup(form: FormData, role: "admin" | "staff"): Promise<FormState> {
  const fields = { name: String(form.get("name") ?? "").slice(0, 100), email: String(form.get("email") ?? "").slice(0, 200) };
  if (!mailConfigured()) {
    return { error: "Email isn't set up on the server yet, so we can't send a verification code. Please contact the administrator.", fields };
  }
  const parsed = signupSchema.safeParse({ name: form.get("name"), email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  if (parsed.data.password !== form.get("confirm")) return { error: "The two passwords don't match.", fields };
  const problem = passwordProblem(parsed.data.password, parsed.data.email);
  if (problem) return { error: problem, fields };

  const { ip } = await clientInfo();
  if (!(await allowAttempt(`signup:ip:${ip}`, 10, 3600)) || !(await allowAttempt(`signup:email:${parsed.data.email}`, 3, 900))) {
    return { error: "Too many sign-up attempts. Please wait a while and try again.", fields };
  }
  try {
    await startSignup({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
      role,
    });
  } catch (err) {
    console.error("[signup] could not send code", err);
    return { error: "We couldn't send the verification email. Check the address and try again.", fields };
  }
  redirect("/signup/verify");
}

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  if ((await getDb().user.count()) === 0) redirect("/setup"); // the very first account must be the admin
  if (!signupOpen()) redirect("/login"); // accounts are created by an admin (Team page)
  return beginSignup(form, "staff");
}

export async function verifySignup(_: FormState, form: FormData): Promise<FormState> {
  const { ip } = await clientInfo();
  if (!(await allowAttempt(`verify:ip:${ip}`, 30, 900))) return { error: "Too many attempts. Please wait 15 minutes." };
  const result = await verifySignupCode(String(form.get("code") ?? ""));
  if (!result.ok) {
    if (result.restart) redirect("/signup?expired=1");
    return { error: result.error };
  }
  await createSession(result.user.id);
  await getDb().user.update({ where: { id: result.user.id }, data: { lastLoginAt: new Date(), timezone: DEFAULT_TZ } });
  await audit("account_created", result.user.id);
  redirect("/?welcome=1");
}

export async function resendCode(_: FormState): Promise<FormState> {
  void _;
  const r = await resendSignupCode().catch((err) => {
    console.error("[signup] resend failed", err);
    return { ok: false, message: "We couldn't send the email. Please try again in a minute." };
  });
  return r.ok ? { ok: r.message } : { error: r.message };
}

// ------------------------------------------------------------------ forgot / reset password
export async function requestReset(_: FormState, form: FormData): Promise<FormState> {
  const parsed = email.safeParse(form.get("email"));
  const done = { ok: "If that email has an account, a reset link is on its way. Check your inbox (and spam)." };
  if (!parsed.success) return { error: "Enter a valid email address." };
  const { ip } = await clientInfo();
  // Same answer whether or not the account exists, so nobody can probe emails.
  if (!(await allowAttempt(`reset:ip:${ip}`, 10, 3600)) || !(await allowAttempt(`reset:email:${parsed.data}`, 3, 3600))) {
    return done;
  }
  const db = getDb();
  const user = await db.user.findUnique({ where: { email: parsed.data } });
  if (user && mailConfigured()) {
    const token = randomToken(32);
    await db.passwordReset.updateMany({ where: { userId: user.id, ...UNUSED_RESET }, data: { usedAt: new Date() } });
    await db.passwordReset.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    try {
      await sendEmail(user.email, `Reset your ${APP_NAME} password`, {
        heading: "Reset your password",
        lines: [
          `Hi ${user.name.split(" ")[0]},`,
          "Someone (hopefully you) asked to reset your password. This link works once and expires in 1 hour.",
          "If it wasn't you, ignore this email — your password stays the same.",
        ],
        button: { text: "Choose a new password", url: `${APP_URL}/reset/${token}` },
      });
      await audit("password_reset_requested", user.id);
    } catch (err) {
      console.error("[auth] reset email failed", err);
    }
  }
  return done;
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const found = await findValidReset(token);
  if (!found) return { error: "This link has expired or was already used. Request a new one." };
  const password = String(form.get("password") ?? "");
  if (password !== form.get("confirm")) return { error: "The two passwords don't match." };
  const problem = passwordProblem(password, found.email);
  if (problem) return { error: problem };

  const db = getDb();
  await db.user.update({ where: { id: found.userId }, data: { passwordHash: await hashPassword(password), lastLoginAt: new Date() } });
  await db.passwordReset.update({ where: { id: found.resetId }, data: { usedAt: new Date() } });
  await destroyOtherSessions(found.userId); // sign out everywhere
  await createSession(found.userId);
  await audit("password_reset", found.userId);
  redirect("/");
}

// ------------------------------------------------------------------ account
export async function updateProfile(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = String(form.get("name") ?? "").trim().slice(0, 100);
  const timezone = String(form.get("timezone") ?? "");
  if (!name) return { error: "Enter your name." };
  if (!isValidTimeZone(timezone)) return { error: "Choose a valid time zone." };
  await getDb().user.update({ where: { id: user.id }, data: { name, timezone } });
  return { ok: "Saved." };
}

export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const db = getDb();
  const full = await db.user.findUnique({ where: { id: user.id } });
  const { ip } = await clientInfo();
  if (!(await allowAttempt(`pwchange:${user.id}:${ip}`, 5, 900))) return { error: "Too many attempts. Wait 15 minutes." };
  if (!(await checkPassword(full?.passwordHash, String(form.get("current") ?? "")))) {
    return { error: "Your current password isn't right." };
  }
  const password = String(form.get("password") ?? "");
  if (password !== form.get("confirm")) return { error: "The two new passwords don't match." };
  const problem = passwordProblem(password, user.email);
  if (problem) return { error: problem };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  await destroyOtherSessions(user.id, user.sessionId);
  await audit("password_changed", user.id);
  return { ok: "Password changed. You've been signed out on your other devices." };
}

export async function signOutOtherDevices() {
  const user = await requireUser();
  await destroyOtherSessions(user.id, user.sessionId);
  await audit("signed_out_other_devices", user.id);
  redirect("/account?signedOut=1");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, isObjectId } from "@/db";
import { hashPassword, randomToken } from "@/lib/auth/crypto";
import { sendSetPasswordLink } from "@/lib/auth/invite";
import { allowAttempt, audit } from "@/lib/auth/request";
import { requireAdmin } from "@/lib/auth/session";
import { mailConfigured } from "@/lib/mail";
import type { FormState } from "./auth";

const inviteSchema = z.object({
  name: z.string().trim().min(1, "Enter their name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
  role: z.enum(["admin", "director"], { message: "Choose a role." }),
});

/** Admin creates an account. No password is chosen or emailed: the person gets a one-time link to set their own. */
export async function inviteUser(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const fields = {
    name: String(form.get("name") ?? "").slice(0, 100),
    email: String(form.get("email") ?? "").slice(0, 200),
    role: String(form.get("role") ?? "director"),
  };
  const parsed = inviteSchema.safeParse(fields);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  if (!mailConfigured()) return { error: "Email isn't set up on the server yet, so the invitation can't be sent. See Settings.", fields };
  if (!(await allowAttempt(`invite:${admin.id}`, 30, 3600))) return { error: "Too many invitations. Please wait a while.", fields };

  const db = getDb();
  if (await db.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } })) {
    return { error: "That email already has an account.", fields };
  }
  // The password is a random value nobody knows; the person sets their own through the emailed link.
  const user = await db.user.create({
    data: { ...parsed.data, passwordHash: await hashPassword(randomToken(32)) },
    select: { id: true, name: true, email: true, role: true },
  });
  try {
    await sendSetPasswordLink(user, admin, "invite");
  } catch (err) {
    console.error("[team] invitation email failed", err);
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
    return { error: "We couldn't send the invitation email, so no account was created. Check the email address and try again.", fields };
  }
  await audit("user_invited", admin.id, `${user.id} as ${user.role}`);
  revalidatePath("/team");
  redirect(`/team?invited=${encodeURIComponent(user.email)}`);
}

/** Sends a fresh set-password link (for an invite that expired or was lost, or a forgotten password). */
export async function resendInvite(userId: string) {
  const admin = await requireAdmin();
  if (!isObjectId(userId)) redirect("/team");
  if (!mailConfigured()) redirect("/team?error=mail");
  if (!(await allowAttempt(`invite:${admin.id}`, 30, 3600))) redirect("/team?error=limit");
  const user = await getDb().user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true, lastLoginAt: true } });
  if (!user) redirect("/team");
  try {
    await sendSetPasswordLink(user, admin, user.lastLoginAt ? "reset" : "invite");
  } catch (err) {
    console.error("[team] resend failed", err);
    redirect("/team?error=send");
  }
  await audit("user_link_resent", admin.id, user.id);
  redirect(`/team?resent=${encodeURIComponent(user.email)}`);
}

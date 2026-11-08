"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, isObjectId } from "@/db";
import { hashPassword, randomToken } from "@/lib/auth/crypto";
import { sendSetPasswordLink } from "@/lib/auth/invite";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { allowAttempt, audit } from "@/lib/auth/request";
import { requireAdmin, requireManager } from "@/lib/auth/session";
import { mailConfigured } from "@/lib/mail";
import { normalizePhone } from "@/lib/sms";
import type { FormState } from "./auth";

const ROLES = ["admin", "director", "staff"] as const;

const inviteSchema = z.object({
  name: z.string().trim().min(1, "Enter their name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
  role: z.enum(ROLES, { message: "Choose a role." }),
});

/**
 * An admin or director creates an account. No password is chosen or emailed: the person gets a one-time link to
 * set their own. Directors can create staff; only admins can create admins and directors.
 */
export async function inviteUser(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireManager();
  const fields = {
    name: String(form.get("name") ?? "").slice(0, 100),
    email: String(form.get("email") ?? "").slice(0, 200),
    role: String(form.get("role") ?? "staff"),
    canSchedule: form.get("canSchedule") === "on" ? "on" : "",
    canSendDocuments: form.get("canSendDocuments") === "on" ? "on" : "",
    phone: String(form.get("phone") ?? "").trim().slice(0, 30),
  };
  const parsed = inviteSchema.safeParse(fields);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  if (parsed.data.role !== "staff" && me.role !== "admin") return { error: "Only an admin can create admin or director accounts.", fields };
  if (!mailConfigured()) return { error: "Email isn't set up on the server yet, so the invitation can't be sent. See Settings.", fields };
  if (!(await allowAttempt(`invite:${me.id}`, 30, 3600))) return { error: "Too many invitations. Please wait a while.", fields };

  const db = getDb();
  if (await db.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } })) {
    return { error: "That email already has an account.", fields };
  }
  const phone = normalizePhone(fields.phone);
  if (!phone) return { error: "Enter their mobile number, for example 0712 345 678.", fields };
  const staff = parsed.data.role === "staff";
  // The password is a random value nobody knows; the person sets their own through the emailed link.
  const user = await db.user.create({
    data: {
      ...parsed.data,
      phone,
      passwordHash: await hashPassword(randomToken(32)),
      canSchedule: staff ? fields.canSchedule === "on" : null,
      canSendDocuments: staff ? fields.canSendDocuments === "on" : null,
    },
    select: { id: true, name: true, email: true, role: true },
  });
  try {
    await sendSetPasswordLink(user, me, "invite");
  } catch (err) {
    console.error("[team] invitation email failed", err);
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
    return { error: "We couldn't send the invitation email, so no account was created. Check the email address and try again.", fields };
  }
  await audit("user_invited", me.id, `${user.id} as ${user.role}`);
  revalidatePath("/team");
  redirect(`/team?invited=${encodeURIComponent(user.email)}`);
}

/** Sends a fresh set-password link (for an invite that expired or was lost, or a forgotten password). */
export async function resendInvite(userId: string) {
  const me = await requireManager();
  if (!isObjectId(userId)) redirect("/team");
  if (!mailConfigured()) redirect("/team?error=mail");
  if (!(await allowAttempt(`invite:${me.id}`, 30, 3600))) redirect("/team?error=limit");
  const user = await getDb().user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true, lastLoginAt: true } });
  if (!user) redirect("/team");
  try {
    await sendSetPasswordLink(user, me, user.lastLoginAt ? "reset" : "invite");
  } catch (err) {
    console.error("[team] resend failed", err);
    redirect("/team?error=send");
  }
  await audit("user_link_resent", me.id, user.id);
  redirect(`/team?resent=${encodeURIComponent(user.email)}`);
}

const PERMISSIONS = { canSchedule: "schedule for others", canSendDocuments: "send documents" } as const;

/** Turns one extra permission on or off for a staff member (admins and directors always have both). */
export async function setPermission(userId: string, permission: keyof typeof PERMISSIONS, on: boolean) {
  const me = await requireManager();
  if (!isObjectId(userId) || !(permission in PERMISSIONS)) redirect("/team");
  const { count } = await getDb().user.updateMany({ where: { id: userId, role: "staff" }, data: { [permission]: on === true } });
  if (count) await audit(on ? "permission_granted" : "permission_removed", me.id, `${userId}: ${PERMISSIONS[permission]}`);
  revalidatePath("/team");
  redirect(`/team?changed=${count ? "1" : "0"}`);
}

/** Admins only. You can't change your own role, and the last admin can't be demoted. */
export async function changeRole(userId: string, form: FormData) {
  const me = await requireAdmin();
  const role = String(form.get("role") ?? "");
  if (!isObjectId(userId) || !(ROLES as readonly string[]).includes(role) || userId === me.id) redirect("/team");
  const db = getDb();
  const target = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target || target.role === role) redirect("/team");
  if (target.role === "admin" && (await db.user.count({ where: { role: "admin" } })) <= 1) redirect("/team?error=lastadmin");
  await db.user.update({ where: { id: userId }, data: { role: role as (typeof ROLES)[number] } });
  await audit("role_changed", me.id, `${userId}: ${target.role} -> ${role}`);
  revalidatePath("/team");
  redirect(`/team?role=${encodeURIComponent(ROLE_LABEL[role as keyof typeof ROLE_LABEL])}`);
}

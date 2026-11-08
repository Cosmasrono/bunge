"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { allowAttempt } from "@/lib/auth/request";
import { requireUser } from "@/lib/auth/session";
import { normalizePhone, sendSms, smsConfigured, smsText } from "@/lib/sms";
import type { FormState } from "./auth";

/** Saves (or, when left empty, removes) the number this person gets SMS messages on. */
export async function savePhoneSettings(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = String(form.get("phone") ?? "").trim().slice(0, 30);
  const phone = raw ? normalizePhone(raw) : null;
  if (raw && !phone) return { error: "Enter a valid phone number, for example 0712 345 678 or +254712345678.", fields: { phone: raw } };
  await getDb().user.update({ where: { id: user.id }, data: { phone } });
  revalidatePath("/account");
  return { ok: phone ? `SMS messages will go to ${phone}.` : "SMS messages are off." };
}

function explain(err: unknown) {
  const { smsCode, smsMessage, httpStatus } = err as { smsCode?: string; smsMessage?: string; httpStatus?: number };
  if (smsCode === "0402") return "Your MobileSasa balance is too low. Top up, then try again.";
  if (smsCode === "0409") return "MobileSasa already delivered this exact message to this number today.";
  if (smsCode === "0401" || httpStatus === 401) return "MobileSasa rejected the token. Check MOBILESASA_API_TOKEN.";
  if (httpStatus === 403) return "That MobileSasa token isn't allowed to send messages. Create one with the Send messages permission.";
  return `MobileSasa couldn't send it${smsMessage ? `: ${smsMessage}` : smsCode ? ` (error ${smsCode})` : ""}.`;
}

export async function sendTestPhoneMessage(_: FormState): Promise<FormState> {
  void _;
  const user = await requireUser();
  if (!smsConfigured()) return { error: "SMS isn't set up on the server yet." };
  if (!user.phone) return { error: "Save your phone number first." };
  if (!(await allowAttempt(`phonetest:${user.id}`, 5, 3600))) return { error: "Too many test messages. Try again in an hour." };
  try {
    // The time keeps each test different: MobileSasa refuses an identical message to the same number within a day.
    const at = new Intl.DateTimeFormat("en-GB", { timeZone: user.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
    await sendSms(user.phone, smsText("Test message", `Your reminders and documents to sign will arrive like this. ${at}`));
  } catch (err) {
    console.error("[sms] test failed", err);
    return { error: explain(err) };
  }
  return { ok: "Accepted by MobileSasa. It should arrive within a minute." };
}

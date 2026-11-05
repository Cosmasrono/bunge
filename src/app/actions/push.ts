"use server";

import { z } from "zod";
import { getDb } from "@/db";
import { allowAttempt, clientInfo } from "@/lib/auth/request";
import { requireUser } from "@/lib/auth/session";
import { isAllowedPushEndpoint, pushConfigured, sendPushToUser } from "@/lib/push";
import type { FormState } from "./auth";

const b64url = z.string().min(8).max(256).regex(/^[A-Za-z0-9_-]+={0,2}$/);
const subscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint, "That browser's notification service isn't supported."),
  keys: z.object({ p256dh: b64url, auth: b64url }),
});

/** Called by the browser after the person allows notifications. */
export async function savePushSubscription(input: unknown): Promise<FormState> {
  const user = await requireUser();
  if (!pushConfigured()) return { error: "Notifications aren't set up on the server yet (VAPID keys)." };
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await allowAttempt(`pushsub:${user.id}`, 20, 3600))) return { error: "Too many attempts. Please wait a while." };
  const { userAgent } = await clientInfo();
  const { endpoint, keys } = parsed.data;
  // The same device can later be used by someone else, so the subscription moves to whoever is signed in now.
  await getDb().pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  });
  return { ok: "Notifications are on for this device." };
}

export async function removePushSubscription(endpoint: string): Promise<FormState> {
  const user = await requireUser();
  await getDb().pushSubscription.deleteMany({ where: { endpoint: String(endpoint).slice(0, 1000), userId: user.id } });
  return { ok: "Notifications are off for this device." };
}

export async function sendTestPush(): Promise<FormState> {
  const user = await requireUser();
  if (!pushConfigured()) return { error: "Notifications aren't set up on the server yet (VAPID keys)." };
  if (!(await allowAttempt(`pushtest:${user.id}`, 10, 3600))) return { error: "Too many test notifications. Try again later." };
  const r = await sendPushToUser(user.id, {
    title: "It works!",
    body: "You will get your reminders as notifications like this one.",
    url: "/account",
    tag: "test",
  });
  if (!r.devices) return { error: "No device has notifications turned on yet." };
  if (!r.sent) return { error: "The notification could not be delivered. Try turning notifications off and on again." };
  return { ok: `Sent to ${r.sent} ${r.sent === 1 ? "device" : "devices"}.` };
}

"use server";

import { audit } from "@/lib/auth/request";
import { destroyCurrentSession, getCurrentUser, touchSession } from "@/lib/auth/session";

/** Called by the browser while the person is using the app, so they aren't signed out for inactivity. */
export async function keepAlive(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  await touchSession(user.sessionId);
  return { ok: true };
}

/** Called by the browser when the idle time ran out. */
export async function signOutIdle(): Promise<void> {
  const user = await getCurrentUser();
  if (user) await audit("signed_out_idle", user.id);
  await destroyCurrentSession();
}

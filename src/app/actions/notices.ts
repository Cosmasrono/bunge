"use server";

import { getDb, isObjectId } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { UNREAD } from "@/lib/notify";

/** Marks some of your notifications as read (only your own). */
export async function markNoticesRead(ids: string[]) {
  const user = await requireUser();
  const valid = ids.filter(isObjectId).slice(0, 50);
  if (!valid.length) return;
  await getDb().notice.updateMany({ where: { id: { in: valid }, userId: user.id, ...UNREAD }, data: { readAt: new Date() } });
}

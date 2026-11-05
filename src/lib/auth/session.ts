import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { randomToken, sha256 } from "./crypto";
import { clientInfo } from "./request";

const isProd = process.env.NODE_ENV === "production";
/** `__Host-` cookies must be Secure, path "/", and can't be set for other domains. */
export const SESSION_COOKIE = isProd ? "__Host-nd_session" : "nd_session";

const IDLE_DAYS = 14; // signed out after 14 days without using the app
const MAX_DAYS = 30; // and always after 30 days
const DAY = 86_400_000;

export async function createSession(userId: string) {
  const token = randomToken(32);
  const { ip, userAgent } = await clientInfo();
  const now = Date.now();
  await getDb().session.create({
    data: {
      id: sha256(token),
      userId,
      expiresAt: new Date(now + IDLE_DAYS * DAY),
      ip,
      userAgent,
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires: new Date(now + MAX_DAYS * DAY),
  });
}

/** The signed-in user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const db = getDb();
  const id = sha256(token);
  const now = new Date();
  const session = await db.session.findFirst({
    where: { id, expiresAt: { gt: now } },
    include: { user: true },
  });
  if (!session) return null;
  if (now.getTime() - session.createdAt.getTime() > MAX_DAYS * DAY) {
    await db.session.deleteMany({ where: { id } });
    return null;
  }
  // Slide the idle timeout, at most once an hour.
  if (now.getTime() - session.lastSeenAt.getTime() > 3_600_000) {
    await db.session.updateMany({
      where: { id },
      data: { lastSeenAt: now, expiresAt: new Date(now.getTime() + IDLE_DAYS * DAY) },
    });
  }
  const { passwordHash: _omit, ...user } = session.user;
  void _omit;
  return { ...user, sessionId: id };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Use at the top of every protected page and server action. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

export async function destroyCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token && token.length <= 100) await getDb().session.deleteMany({ where: { id: sha256(token) } });
  store.delete(SESSION_COOKIE);
}

/** Signs the user out everywhere except (optionally) this session. */
export async function destroyOtherSessions(userId: string, keepSessionId?: string) {
  await getDb().session.deleteMany({
    where: keepSessionId ? { userId, id: { not: keepSessionId } } : { userId },
  });
}

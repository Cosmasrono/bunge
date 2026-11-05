import "server-only";
import { headers } from "next/headers";
import { getDb } from "@/db";

/** Visitor IP. Vercel sets x-real-ip / x-forwarded-for itself (clients can't override them there). */
export async function clientInfo() {
  const h = await headers();
  const ip = (h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 64);
  const userAgent = (h.get("user-agent") || "").slice(0, 300);
  return { ip, userAgent };
}

/**
 * Simple database-backed rate limit. Records an attempt and returns false
 * if `limit` attempts already happened for `key` within `windowSeconds`.
 */
export async function allowAttempt(key: string, limit: number, windowSeconds: number) {
  const db = getDb();
  const since = new Date(Date.now() - windowSeconds * 1000);
  const n = await db.rateLimit.count({ where: { key, at: { gt: since } } });
  if (n >= limit) return false;
  await db.rateLimit.create({ data: { key } });
  return true;
}

export async function clearAttempts(key: string) {
  await getDb().rateLimit.deleteMany({ where: { key } });
}

export async function pruneRateLimits() {
  await getDb().rateLimit.deleteMany({ where: { at: { lt: new Date(Date.now() - 86_400_000) } } });
}

export async function audit(action: string, userId: string | null, detail = "") {
  const { ip } = await clientInfo().catch(() => ({ ip: "system" }));
  await getDb().auditLog.create({ data: { action, userId, detail: detail.slice(0, 500), ip } });
}

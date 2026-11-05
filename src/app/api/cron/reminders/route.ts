import { safeEqual } from "@/lib/auth/crypto";
import { pruneRateLimits } from "@/lib/auth/request";
import { prunePendingSignups } from "@/lib/auth/signup";
import { runDueReminders } from "@/lib/reminders";

export const maxDuration = 60;

/**
 * Called every minute by a scheduler (cron-job.org, and Vercel Cron as a daily backup).
 * Requires the header:  Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  if (!secret || secret.length < 16 || !safeEqual(auth, `Bearer ${secret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runDueReminders();
  if (new Date().getUTCMinutes() === 0) {
    await pruneRateLimits();
    await prunePendingSignups();
  }
  return Response.json(result);
}

/**
 * Runs once when the server starts.
 * - When running as a normal long-lived server (your PC, or any non-Vercel host):
 *   checks for due reminders every 30 seconds. On Vercel this is done by the cron URL instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Needs a database; without DATABASE_URL the app shows a setup error instead.
  const runTimer = Boolean(process.env.DATABASE_URL) && !process.env.VERCEL && process.env.INTERNAL_SCHEDULER !== "off";
  const g = globalThis as unknown as { __reminderTimer?: NodeJS.Timeout };
  if (runTimer && !g.__reminderTimer) {
    const { runDueReminders } = await import("./lib/reminders");
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const r = await runDueReminders();
        if (r.sent || r.failed) console.log(`[reminders] sent ${r.sent}, failed ${r.failed}`);
      } catch (err) {
        console.error("[reminders] check failed", err);
      } finally {
        running = false;
      }
    };
    g.__reminderTimer = setInterval(tick, 30_000);
    setTimeout(tick, 5_000);
    console.log("[reminders] built-in checker started (every 30 seconds)");
  }
}

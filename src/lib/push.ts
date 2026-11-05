import webpush from "web-push";
import { getDb } from "@/db";
import { APP_URL } from "@/lib/mail";

/**
 * Web Push (notifications on phones and computers, even when the app isn't open).
 * Needs a VAPID key pair in the environment: run `npm run push:keys` and copy the two lines it prints.
 */
export function pushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || "";

let ready = false;
function setup() {
  if (ready) return;
  // The "subject" tells push services who to contact about this sender: a mailto: address or your https site.
  const subject = process.env.VAPID_SUBJECT || (APP_URL.startsWith("https://") ? APP_URL : "mailto:admin@nation-desk.local");
  webpush.setVapidDetails(subject, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
}

/**
 * Browsers hand us a push URL and we later POST to it from the server. Only accept the real push services,
 * so a signed-in user can't make the server call an arbitrary address.
 */
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

export function isAllowedPushEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && !u.port && !u.username && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

export type PushPayload = { title: string; body: string; /** Page to open when tapped (same site). */ url: string; tag?: string };

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Sends to every device the person turned notifications on for. Dead subscriptions are removed. */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  const result = { devices: 0, sent: 0, failed: 0 };
  if (!pushConfigured()) return result;
  const db = getDb();
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  result.devices = subs.length;
  if (!subs.length) return result;
  setup();
  const body = JSON.stringify({ ...payload, title: clip(payload.title, 120), body: clip(payload.body, 300) });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 60 * 60, // drop it if the phone stays offline for an hour: a late reminder is noise
          urgency: "high",
          timeout: 10_000,
        });
        result.sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.pushSubscription.deleteMany({ where: { id: s.id } }); // unsubscribed or expired
        } else {
          result.failed++;
          console.error("[push] send failed", status ?? (err as Error).message);
        }
      }
    }),
  );
  return result;
}

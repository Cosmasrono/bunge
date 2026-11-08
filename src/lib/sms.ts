import { APP_NAME } from "@/lib/mail";

/**
 * SMS through MobileSasa. Needs MOBILESASA_API_TOKEN (an "mbs_" token with permission to send messages) and optionally
 * MOBILESASA_SENDER_ID (an approved sender name; it is case-sensitive). Without one, "MOBILESASA" is used.
 */
export function smsConfigured() {
  return Boolean(process.env.MOBILESASA_API_TOKEN);
}

/** "0712 345 678", "254712345678" or "+254712345678" become "+254712345678". Null if it isn't a phone number. */
export function normalizePhone(raw: string) {
  let p = raw.replace(/[\s().-]/g, "");
  if (/^0[17]\d{8}$/.test(p)) p = `+254${p.slice(1)}`; // Kenyan local format
  else if (/^[1-9]\d{7,14}$/.test(p)) p = `+${p}`;
  return /^\+[1-9]\d{7,14}$/.test(p) ? p : null;
}

/**
 * One SMS is 160 plain characters. A single special character (a curly quote, "·") switches the whole message to a
 * format that fits only 70, which costs more, so text is reduced to plain characters and cut to fit one SMS.
 */
export function smsText(title: string, body: string) {
  const plain = `${APP_NAME}: ${title}${body ? ` - ${body}` : ""}`
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—·]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[[\]{}\\^~|]/g, "") // these count as two characters each
    .replace(/\s+/g, " ")
    .trim();
  return plain.length <= 160 ? plain : `${plain.slice(0, 157).trimEnd()}...`;
}

/**
 * Hands a message to MobileSasa. Throws if it is refused; `smsCode` is their response code ("0402" is no balance,
 * "0409" an identical message to this number today, "0422" a rejected request, "0401" a bad token).
 */
export async function sendSms(to: string, message: string) {
  const res = await fetch("https://api.mobilesasa.com/v1/send/message", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MOBILESASA_API_TOKEN}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ senderID: process.env.MOBILESASA_SENDER_ID || "MOBILESASA", phone: to, message }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const text = await res.text();
  let reply: { status?: boolean; responseCode?: string; message?: string; messageId?: string } = {};
  try {
    reply = JSON.parse(text);
  } catch {
    /* handled below */
  }
  // "0200" means MobileSasa queued it with the carrier.
  if (!res.ok || reply.status !== true || reply.responseCode !== "0200") {
    throw Object.assign(new Error(`MobileSasa ${reply.responseCode ?? res.status}: ${reply.message ?? text.slice(0, 200)}`), {
      smsCode: reply.responseCode,
      smsMessage: reply.message,
      httpStatus: res.status,
    });
  }
  return reply.messageId;
}

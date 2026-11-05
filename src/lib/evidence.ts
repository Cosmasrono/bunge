import { z } from "zod";

/**
 * What a signer's own device reports when they sign, with their consent. It is "reported", not proven:
 * the signer's browser supplies it. The time and IP address are recorded separately by the server.
 *
 * A MAC address is deliberately not here: browsers cannot read it, and it never leaves the local network,
 * so no website or server can see it. The deviceId (a random value kept in the browser) identifies a device instead.
 */
export const evidenceSchema = z.object({
  deviceId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(),
  platform: z.string().max(80).optional(),
  language: z.string().max(20).optional(),
  timezone: z.string().max(64).optional(),
  screen: z.string().max(20).optional(),
  touch: z.boolean().optional(),
  geoStatus: z.enum(["granted", "denied", "unavailable", "timeout", "skipped"]),
  geo: z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      accuracy: z.number().min(0).max(10_000_000),
    })
    .nullable(),
});

export type Evidence = z.infer<typeof evidenceSchema>;

export const NO_EVIDENCE: Evidence = { geoStatus: "skipped", geo: null };

/** Parses the JSON the browser sent; anything invalid becomes "nothing reported". */
export function parseEvidence(raw: unknown): Evidence {
  if (typeof raw !== "string" || raw.length > 2000) return NO_EVIDENCE;
  try {
    const parsed = evidenceSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : NO_EVIDENCE;
  } catch {
    return NO_EVIDENCE;
  }
}

/** "Chrome on Windows" from a user-agent string (good enough for a record; not exact). */
export function describeAgent(ua: string | null | undefined) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "unknown system";
  return `${browser} on ${os}`;
}

export function describeGeo(e: Evidence) {
  if (e.geo) return `${e.geo.lat.toFixed(5)}, ${e.geo.lon.toFixed(5)} (accuracy about ${Math.round(e.geo.accuracy)} m)`;
  return `Not provided (${e.geoStatus === "skipped" ? "not requested" : e.geoStatus})`;
}

/** A link that opens the point on OpenStreetMap, for a person to look at. */
export function mapLink(e: Evidence) {
  return e.geo ? `https://www.openstreetmap.org/?mlat=${e.geo.lat}&mlon=${e.geo.lon}#map=17/${e.geo.lat}/${e.geo.lon}` : null;
}

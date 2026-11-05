import "server-only";
import { headers } from "next/headers";
import { APP_NAME, APP_URL } from "@/lib/mail";

/** Where a signature was made, in words. Worked out by the server when the document is signed. */
export type Place = {
  /** Street address for the signer's GPS point, from OpenStreetMap. */
  address?: string;
  /** Rough location of the IP address (city level), from the hosting platform. */
  ipCity?: string;
  ipRegion?: string;
  ipCountry?: string;
};

const clean = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

export function parsePlace(raw: unknown): Place {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return { address: clean(r.address), ipCity: clean(r.ipCity, 100), ipRegion: clean(r.ipRegion, 100), ipCountry: clean(r.ipCountry, 100) };
}

/**
 * City, region and country for the visitor's IP address. Vercel adds these headers to every request for free,
 * so nothing is sent to another service. Elsewhere (e.g. on your own PC) they are absent.
 */
export async function ipPlaceFromHeaders(): Promise<Place> {
  const h = await headers();
  const decode = (v: string | null) => {
    if (!v) return undefined;
    try {
      return clean(decodeURIComponent(v), 100);
    } catch {
      return clean(v, 100);
    }
  };
  const code = h.get("x-vercel-ip-country");
  let country: string | undefined;
  try {
    country = code ? (new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code) : undefined;
  } catch {
    country = code ?? undefined;
  }
  return { ipCity: decode(h.get("x-vercel-ip-city")), ipRegion: decode(h.get("x-vercel-ip-country-region")), ipCountry: country };
}

/**
 * Street address for a GPS point, from OpenStreetMap's Nominatim service (free; at most one lookup per second
 * and the results must be credited to OpenStreetMap). Used once per signature and then stored.
 * Set GEOCODING=off to never send coordinates to OpenStreetMap.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string | undefined> {
  if (process.env.GEOCODING === "off") return undefined;
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&zoom=18&addressdetails=0`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": `${APP_NAME.replace(/[^\w .-]/g, "")}/1.0 (+${APP_URL})`, "Accept-Language": "en" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { display_name?: unknown };
    return clean(json.display_name);
  } catch {
    return undefined;
  }
}

export function describeIpPlace(p: Place) {
  // Vercel gives the region as a short code (e.g. "30" for Nairobi), which means little to a reader; show it only if it's a name.
  const region = p.ipRegion && !/^[A-Z0-9]{1,3}$/i.test(p.ipRegion) ? p.ipRegion : undefined;
  const parts = [p.ipCity, region, p.ipCountry].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

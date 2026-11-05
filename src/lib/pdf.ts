import "server-only";
import { createHash } from "node:crypto";
import { describeAgent, describeGeo, type Evidence } from "@/lib/evidence";
import { describeIpPlace, type Place } from "@/lib/geo";
import type { SignatureBox } from "@/lib/signature-box";
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/**
 * Largest PDF that can be uploaded here. Vercel refuses any request over 4.5 MB before it reaches the app,
 * so when hosted there the limit is 4 MB (leaving room for the rest of the form).
 */
export const uploadLimitBytes = () => (process.env.VERCEL ? 4 * 1024 * 1024 : MAX_PDF_BYTES);
export const formatMb = (bytes: number) => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
export const MAX_PDF_PAGES = 300;

export const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Confirms the bytes are a readable, unencrypted PDF and returns its page count. Throws a friendly Error otherwise. */
export async function inspectPdf(bytes: Uint8Array) {
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  if (!head.includes("%PDF-")) throw new Error("That file isn't a PDF.");
  let pageCount: number;
  try {
    pageCount = (await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false })).getPageCount();
  } catch (err) {
    const msg = String((err as Error).message).toLowerCase();
    if (msg.includes("encrypt")) throw new Error("This PDF is password-protected. Remove the password and upload it again.");
    throw new Error("We couldn't read that PDF. It may be damaged.");
  }
  if (pageCount < 1) throw new Error("That PDF has no pages.");
  if (pageCount > MAX_PDF_PAGES) throw new Error(`That PDF has too many pages (limit ${MAX_PDF_PAGES}).`);
  return { pageCount };
}

/** Standard PDF fonts only cover Latin text; replace anything else with "?" instead of failing. */
function printable(text: string, font: PDFFont) {
  const supported = new Set(font.getCharacterSet());
  return [...text.replace(/\s+/g, " ")].map((c) => (supported.has(c.codePointAt(0)!) ? c : "?")).join("");
}

function fit(text: string, font: PDFFont, size: number, maxWidth: number) {
  let t = printable(text, font);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "...", size) > maxWidth) t = t.slice(0, -1);
  return t + "...";
}

/** A plain white A4 page, for documents that only need a signature (or for trying the feature out). */
export async function createBlankPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([595.28, 841.89]);
  return pdf.save();
}

export type SignatureInput = { kind: "drawn"; png: Uint8Array } | { kind: "typed"; text: string };

/** True when a typed name can be rendered with the built-in signature font. */
export function canTypeSignature(text: string) {
  return [...text].every((c) => /[\x20-\x7E -ÿ]/.test(c));
}

/**
 * Returns the original PDF plus one extra page: a signature certificate with the signature,
 * who signed, when, from which address, and the SHA-256 fingerprint of the original file.
 */
export async function buildSignedPdf(opts: {
  original: Uint8Array;
  title: string;
  originalHash: string;
  signer: { name: string; email: string };
  sender: { name: string; email: string };
  signedAt: Date;
  timezone: string;
  ip: string;
  agent: string;
  evidence: Evidence;
  place: Place;
  signature: SignatureInput;
  /** Where to stamp the signature on the document itself; null = certificate page only. */
  box?: SignatureBox | null;
  /** Short reference printed under the stamped signature. */
  reference?: string;
}) {
  const pdf = await PDFDocument.load(opts.original, { updateMetadata: false });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const script = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  const placedOn = await stampSignature(pdf, opts, { regular, script });

  const page = pdf.addPage([595.28, 841.89]); // A4
  const left = 56;
  const width = 595.28 - left * 2;
  const ink = rgb(0.1, 0.1, 0.15);
  const muted = rgb(0.4, 0.4, 0.46);
  const accent = rgb(0.48, 0.27, 0.15); // brand brown
  const pink = rgb(0.72, 0.13, 0.37);
  let y = 780;

  page.drawRectangle({ x: 0, y: 842 - 6, width: 595.28, height: 6, color: accent });
  page.drawRectangle({ x: 0, y: 842 - 8, width: 595.28, height: 2, color: pink });
  page.drawText("Signature certificate", { x: left, y, size: 24, font: bold, color: ink });
  y -= 22;
  page.drawText("This page was added when the document was signed electronically.", { x: left, y, size: 10.5, font: regular, color: muted });
  y -= 44;

  const row = (label: string, value: string) => {
    page.drawText(label.toUpperCase(), { x: left, y, size: 8, font: bold, color: muted });
    y -= 15;
    page.drawText(fit(value, regular, 11.5, width), { x: left, y, size: 11.5, font: regular, color: ink });
    y -= 27;
  };

  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: opts.timezone,
    dateStyle: "full",
    timeStyle: "long",
  }).format(opts.signedAt);

  row("Document", opts.title);
  row("Sent by", `${opts.sender.name} <${opts.sender.email}>`);
  row("Signed by", `${opts.signer.name} <${opts.signer.email}>`);
  row("Signed on", `${when}  (${opts.signedAt.toISOString()})`);
  row("From IP address", opts.ip);

  // The 64-character fingerprint is split over two lines so it fits the page.
  page.drawText("ORIGINAL FILE FINGERPRINT (SHA-256)", { x: left, y, size: 8, font: bold, color: muted });
  y -= 15;
  page.drawText(opts.originalHash.slice(0, 32), { x: left, y, size: 11.5, font: regular, color: ink });
  y -= 15;
  page.drawText(opts.originalHash.slice(32), { x: left, y, size: 11.5, font: regular, color: ink });
  y -= 36;

  page.drawText("SIGNATURE", { x: left, y, size: 8, font: bold, color: muted });
  y -= 10;
  const boxH = 110;
  page.drawRectangle({ x: left, y: y - boxH, width: 300, height: boxH, borderColor: rgb(0.8, 0.8, 0.85), borderWidth: 1 });
  if (opts.signature.kind === "drawn") {
    const img = await pdf.embedPng(opts.signature.png);
    const scale = Math.min(280 / img.width, 90 / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, { x: left + (300 - w) / 2, y: y - boxH + (boxH - h) / 2, width: w, height: h });
  } else {
    const text = opts.signature.text;
    let size = 34;
    while (size > 14 && script.widthOfTextAtSize(text, size) > 280) size -= 2;
    page.drawText(text, { x: left + 10, y: y - boxH / 2 - size / 3, size, font: script, color: ink });
  }
  y -= boxH + 30;

  // What the signer's device reported, with their consent (the server records the time and IP address itself).
  page.drawText("SIGNING DETAILS", { x: left, y, size: 8, font: bold, color: muted });
  y -= 16;
  const ev = opts.evidence;
  const details: [string, string][] = [
    ["Browser", describeAgent(opts.agent)],
    ["Device", [ev.platform, ev.screen, ev.touch === undefined ? "" : ev.touch ? "touch screen" : "no touch screen", ev.language].filter(Boolean).join("  |  ") || "Not reported"],
    ["Device ID", ev.deviceId ?? "Not reported"],
    ["Device time zone", ev.timezone ?? "Not reported"],
    ["Location (GPS)", describeGeo(ev)],
    ["Address", opts.place.address ?? (ev.geo ? "Not found" : "No location shared")],
    ["IP location", describeIpPlace(opts.place) ?? "Not available"],
    ["Signature placed", placedOn === null ? "On this certificate page only" : `On page ${placedOn + 1} of the document, and on this page`],
  ];
  for (const [label, value] of details) {
    page.drawText(label, { x: left, y, size: 9.5, font: bold, color: muted });
    page.drawText(fit(value, regular, 9.5, width - 110), { x: left + 110, y, size: 9.5, font: regular, color: ink });
    y -= 17;
  }
  y -= 14;

  const notice =
    "The signer confirmed they agree to sign this document electronically and to record these details. Time and IP address were recorded by the server; location and device details were reported by the signer's device. The fingerprint above identifies the " +
    "exact original file that was shown to the signer; any change to that file produces a different fingerprint. " +
    "The address is looked up from the GPS point (data © OpenStreetMap contributors); the IP location is approximate.";
  let line = "";
  for (const w of notice.split(" ")) {
    const next = line ? `${line} ${w}` : w;
    if (regular.widthOfTextAtSize(next, 9.5) > width) {
      page.drawText(line, { x: left, y, size: 9.5, font: regular, color: muted });
      y -= 13;
      line = w;
    } else line = next;
  }
  if (line) page.drawText(line, { x: left, y, size: 9.5, font: regular, color: muted });

  return pdf.save();
}

/**
 * Draws the signature into the box the sender marked, plus a small "Signed electronically by …" line under it.
 * Returns the page index it was placed on, or null when there is no box (or the page is rotated, which isn't supported).
 */
async function stampSignature(
  pdf: PDFDocument,
  opts: Parameters<typeof buildSignedPdf>[0],
  fonts: { regular: PDFFont; script: PDFFont },
): Promise<number | null> {
  const box = opts.box;
  if (!box || box.page >= pdf.getPageCount()) return null;
  const target = pdf.getPage(box.page);
  if (target.getRotation().angle % 360 !== 0) return null;

  // The box is measured from the top-left of the visible page; PDF coordinates start at the bottom-left.
  const crop = target.getCropBox();
  const bx = crop.x + box.x * crop.width;
  const bw = box.w * crop.width;
  const bh = box.h * crop.height;
  const by = crop.y + (1 - box.y - box.h) * crop.height;

  const ink = rgb(0.08, 0.1, 0.32); // dark blue, like a pen
  const captionSize = Math.max(5, Math.min(7, bh * 0.11));
  const showCaption = bh >= 30 && bw >= 90;
  const captionH = showCaption ? captionSize * 2 + 5 : 0;
  const area = { x: bx + 3, y: by + captionH + 1, w: bw - 6, h: bh - captionH - 3 };

  if (opts.signature.kind === "drawn") {
    const img = await pdf.embedPng(opts.signature.png);
    const scale = Math.min(area.w / img.width, area.h / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    target.drawImage(img, { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, width: w, height: h });
  } else {
    const text = opts.signature.text;
    let size = Math.min(40, area.h * 0.75);
    while (size > 6 && fonts.script.widthOfTextAtSize(text, size) > area.w) size -= 1;
    const tw = fonts.script.widthOfTextAtSize(text, size);
    target.drawText(text, { x: area.x + (area.w - tw) / 2, y: area.y + (area.h - size * 0.7) / 2, size, font: fonts.script, color: ink });
  }

  if (showCaption) {
    const when = new Intl.DateTimeFormat("en-GB", { timeZone: opts.timezone, dateStyle: "medium", timeStyle: "short" }).format(opts.signedAt);
    const lines = [`Signed electronically by ${opts.signer.name}`, `${when}${opts.reference ? ` · Ref ${opts.reference}` : ""} · see last page`];
    lines.forEach((line, i) => {
      target.drawText(fit(line, fonts.regular, captionSize, bw - 6), {
        x: bx + 3,
        y: by + 2 + (lines.length - 1 - i) * (captionSize + 2),
        size: captionSize,
        font: fonts.regular,
        color: rgb(0.35, 0.35, 0.42),
      });
    });
  }
  return box.page;
}

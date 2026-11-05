import "server-only";
import { createHash } from "node:crypto";
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
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
  signature: SignatureInput;
}) {
  const pdf = await PDFDocument.load(opts.original, { updateMetadata: false });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const script = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  const page = pdf.addPage([595.28, 841.89]); // A4
  const left = 56;
  const width = 595.28 - left * 2;
  const ink = rgb(0.1, 0.1, 0.15);
  const muted = rgb(0.4, 0.4, 0.46);
  const accent = rgb(0.31, 0.27, 0.9);
  let y = 780;

  page.drawRectangle({ x: 0, y: 842 - 6, width: 595.28, height: 6, color: accent });
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
  y -= boxH + 36;

  const notice =
    "The signer confirmed they agree to sign this document electronically. The fingerprint above identifies the " +
    "exact original file that was shown to the signer; any change to that file produces a different fingerprint.";
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

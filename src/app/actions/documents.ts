"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, isObjectId } from "@/db";
import { allowAttempt, audit, clientInfo } from "@/lib/auth/request";
import { requireUser } from "@/lib/auth/session";
import { APP_URL, mailConfigured, sendEmail } from "@/lib/mail";
import { buildSignedPdf, canTypeSignature, createBlankPdf, inspectPdf, MAX_PDF_BYTES, sha256Hex } from "@/lib/pdf";
import { deleteFile, getFile, newFileKey, putFile } from "@/lib/storage";
import type { FormState } from "./auth";

const MAX_SIGNATURE_BYTES = 400_000;

const sendSchema = z.object({
  title: z.string().trim().min(1, "Give the document a title.").max(150),
  note: z.string().trim().max(1000, "Keep the note under 1000 characters."),
  signerId: z.string().refine(isObjectId, "Choose who should sign."),
});

/** Emails are a courtesy: the document is already saved, so a failed email never fails the action. */
async function notify(to: string, subject: string, content: Parameters<typeof sendEmail>[2]) {
  if (!mailConfigured()) return;
  try {
    await sendEmail(to, subject, content);
  } catch (err) {
    console.error("[documents] email failed", err);
  }
}

const link = (id: string) => `${APP_URL}/documents/${id}`;

// ------------------------------------------------------------------ send a document
export async function createDocument(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const fields = {
    title: String(form.get("title") ?? "").slice(0, 150),
    note: String(form.get("note") ?? "").slice(0, 1000),
    signerId: String(form.get("signerId") ?? ""),
  };
  const parsed = sendSchema.safeParse(fields);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  // Sending a document to yourself is allowed (handy for trying it out).

  const blank = form.get("blank") === "on";
  const file = form.get("file");
  if (!blank) {
    if (!(file instanceof File) || file.size === 0) return { error: 'Choose a PDF to upload, or tick "Use a blank page".', fields };
    if (file.size > MAX_PDF_BYTES) return { error: `That file is too large. The limit is ${MAX_PDF_BYTES / 1024 / 1024} MB.`, fields };
  }

  const db = getDb();
  const signer = await db.user.findUnique({ where: { id: parsed.data.signerId }, select: { id: true, name: true, email: true } });
  if (!signer) return { error: "That person no longer has an account.", fields };
  if (!(await allowAttempt(`docsend:${user.id}`, 20, 3600))) return { error: "You've sent a lot of documents. Please wait a while.", fields };

  const upload = blank ? null : (file as File);
  const bytes = upload ? new Uint8Array(await upload.arrayBuffer()) : await createBlankPdf();
  let pageCount: number;
  try {
    ({ pageCount } = await inspectPdf(bytes));
  } catch (err) {
    return { error: (err as Error).message, fields };
  }

  const fileKey = newFileKey();
  let id: string;
  try {
    await putFile(fileKey, bytes);
    const doc = await db.document.create({
      data: {
        title: parsed.data.title,
        note: parsed.data.note,
        fileName: upload ? upload.name.replace(/[^\w.\- ()]/g, "_").slice(0, 150) || "document.pdf" : "blank-page.pdf",
        fileSize: bytes.length,
        fileKey,
        fileHash: sha256Hex(bytes),
        pageCount,
        senderId: user.id,
        signerId: signer.id,
      },
      select: { id: true },
    });
    id = doc.id;
  } catch (err) {
    console.error("[documents] could not save", err);
    await deleteFile(fileKey).catch(() => {});
    return { error: err instanceof Error && err.message.includes("storage") ? err.message : "We couldn't save the document. Please try again.", fields };
  }

  await audit("document_sent", user.id, `${id} to ${signer.id}`);
  // No email when you send it to yourself: you're already looking at it.
  if (signer.id !== user.id) await notify(signer.email, `${user.name} sent you a document to sign: ${parsed.data.title}`, {
    heading: "A document is waiting for your signature",
    lines: [
      `Hi ${signer.name.split(" ")[0]}, ${user.name} sent you "${parsed.data.title}" (${pageCount} ${pageCount === 1 ? "page" : "pages"}).`,
      ...(parsed.data.note ? [`Note from ${user.name.split(" ")[0]}: ${parsed.data.note}`] : []),
    ],
    button: { text: "Review and sign", url: link(id) },
    footer: "You need to be signed in to view and sign the document.",
  });
  revalidatePath("/documents");
  redirect(`/documents/${id}?sent=1`);
}

// ------------------------------------------------------------------ sign
function readPng(dataUrl: string) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m || m[1].length > MAX_SIGNATURE_BYTES * 1.4) return null;
  const png = Buffer.from(m[1], "base64");
  const isPng = png.length > 100 && png.length <= MAX_SIGNATURE_BYTES && png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return isPng ? new Uint8Array(png) : null;
}

export async function signDocument(documentId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isObjectId(documentId)) return { error: "That document no longer exists." };
  const db = getDb();
  const doc = await db.document.findFirst({
    where: { id: documentId, signerId: user.id, status: "pending" },
    include: { sender: { select: { id: true, name: true, email: true } } },
  });
  if (!doc) return { error: "This document is no longer waiting for your signature." };
  if (form.get("agree") !== "on") return { error: "Tick the box to confirm you agree to sign electronically." };

  const kind = form.get("kind");
  let signature: Parameters<typeof buildSignedPdf>[0]["signature"];
  if (kind === "drawn") {
    const png = readPng(String(form.get("drawn") ?? ""));
    if (!png) return { error: "Draw your signature in the box first." };
    signature = { kind: "drawn", png };
  } else if (kind === "typed") {
    const text = String(form.get("typed") ?? "").replace(/\s+/g, " ").trim();
    if (text.length < 2 || text.length > 60) return { error: "Type your full name (2 to 60 characters)." };
    if (!canTypeSignature(text)) return { error: "Typed signatures only support Latin letters. Please draw your signature instead." };
    signature = { kind: "typed", text };
  } else {
    return { error: "Choose how you want to sign." };
  }
  if (!(await allowAttempt(`docsign:${user.id}`, 30, 3600))) return { error: "Too many attempts. Please wait a while." };

  const { ip, userAgent } = await clientInfo();
  const signedKey = newFileKey();
  try {
    const original = new Uint8Array(await getFile(doc.fileKey));
    if (sha256Hex(original) !== doc.fileHash) {
      await audit("document_file_mismatch", user.id, doc.id);
      return { error: "The stored file doesn't match what was uploaded, so it can't be signed. Ask the sender to upload it again." };
    }
    const signedAt = new Date();
    const signed = await buildSignedPdf({
      original,
      title: doc.title,
      originalHash: doc.fileHash,
      signer: { name: user.name, email: user.email },
      sender: { name: doc.sender.name, email: doc.sender.email },
      signedAt,
      timezone: user.timezone,
      ip,
      signature,
    });
    await putFile(signedKey, signed);
    // Only one response can win: this updates the document only while it is still pending.
    const { count } = await db.document.updateMany({
      where: { id: doc.id, signerId: user.id, status: "pending" },
      data: {
        status: "signed",
        respondedAt: signedAt,
        signedFileKey: signedKey,
        signedHash: sha256Hex(signed),
        signatureKind: signature.kind,
        signerIp: ip,
        signerAgent: userAgent,
      },
    });
    if (!count) {
      await deleteFile(signedKey).catch(() => {});
      return { error: "This document was already answered or cancelled." };
    }
  } catch (err) {
    console.error("[documents] signing failed", err);
    await deleteFile(signedKey).catch(() => {});
    return { error: "We couldn't sign the document. Please try again." };
  }

  await audit("document_signed", user.id, doc.id);
  await notify(doc.sender.email, `${user.name} signed "${doc.title}"`, {
    heading: "Your document was signed",
    lines: [`Hi ${doc.sender.name.split(" ")[0]}, ${user.name} signed "${doc.title}". The signed copy is ready to download.`],
    button: { text: "Open the signed document", url: link(doc.id) },
  });
  revalidatePath("/documents");
  redirect(`/documents/${doc.id}?signed=1`);
}

// ------------------------------------------------------------------ decline / cancel
export async function declineDocument(documentId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isObjectId(documentId)) return { error: "That document no longer exists." };
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  const db = getDb();
  const doc = await db.document.findFirst({
    where: { id: documentId, signerId: user.id, status: "pending" },
    include: { sender: { select: { name: true, email: true } } },
  });
  if (!doc) return { error: "This document is no longer waiting for your signature." };
  const { count } = await db.document.updateMany({
    where: { id: doc.id, signerId: user.id, status: "pending" },
    data: { status: "declined", respondedAt: new Date(), declineReason: reason },
  });
  if (!count) return { error: "This document was already answered or cancelled." };

  await audit("document_declined", user.id, doc.id);
  await notify(doc.sender.email, `${user.name} declined to sign "${doc.title}"`, {
    heading: "Your document was declined",
    lines: [
      `Hi ${doc.sender.name.split(" ")[0]}, ${user.name} declined to sign "${doc.title}".`,
      ...(reason ? [`Reason: ${reason}`] : []),
    ],
    button: { text: "Open the document", url: link(doc.id) },
  });
  revalidatePath("/documents");
  redirect(`/documents/${doc.id}?declined=1`);
}

export async function cancelDocument(documentId: string) {
  const user = await requireUser();
  if (!isObjectId(documentId)) redirect("/documents");
  const { count } = await getDb().document.updateMany({
    where: { id: documentId, senderId: user.id, status: "pending" },
    data: { status: "cancelled", respondedAt: new Date() },
  });
  if (count) await audit("document_cancelled", user.id, documentId);
  revalidatePath("/documents");
  redirect(`/documents/${documentId}`);
}

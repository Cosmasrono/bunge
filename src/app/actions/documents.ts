"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb, isObjectId } from "@/db";
import { allowAttempt, audit, clientInfo } from "@/lib/auth/request";
import { canSendDocuments } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { parseEvidence } from "@/lib/evidence";
import { ipPlaceFromHeaders, reverseGeocode, type Place } from "@/lib/geo";
import { notifyUser } from "@/lib/notify";
import { canTypeSignature, createBlankPdf, formatMb, inspectPdf, sha256Hex, uploadLimitBytes } from "@/lib/pdf";
import { parseSignatureBox, type SignatureBox } from "@/lib/signature-box";
import { documentLink, finalizeIfComplete, removeSigningEvents } from "@/lib/signing";
import { deleteFile, newFileKey, putFile } from "@/lib/storage";
import { localStringToUtc, utcToWall } from "@/lib/time";
import type { FormState } from "./auth";

const MAX_SIGNATURE_BYTES = 400_000;
const MAX_SIGNERS = 20;
/** Reminders for the "sign by" event: 1 day, 5 hours, 1 hour and 15 minutes before. */
const DEADLINE_LEADS = [1440, 300, 60, 15];

const sendSchema = z.object({
  title: z.string().trim().min(1, "Give the document a title.").max(150),
  note: z.string().trim().max(1000, "Keep the note under 1000 characters."),
});

const first = (name: string) => name.split(" ")[0];
const pad = (n: number) => String(n).padStart(2, "0");

// ------------------------------------------------------------------ send a document
export async function createDocument(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!canSendDocuments(user)) return { error: "You don't have permission to send documents. Ask a director or admin to allow it." };
  const signerIds = [...new Set(form.getAll("signerIds").map(String))];
  const schedule = form.get("schedule") === "on";
  const fields = {
    title: String(form.get("title") ?? "").slice(0, 150),
    note: String(form.get("note") ?? "").slice(0, 1000),
    signerIds: signerIds.join(","),
    schedule: schedule ? "on" : "",
    dueDate: String(form.get("dueDate") ?? ""),
    dueTime: String(form.get("dueTime") ?? ""),
  };
  const parsed = sendSchema.safeParse(fields);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  if (!signerIds.length) return { error: "Choose at least one person to sign.", fields };
  if (signerIds.length > MAX_SIGNERS) return { error: `Choose at most ${MAX_SIGNERS} people.`, fields };
  if (!signerIds.every(isObjectId)) return { error: "Choose who should sign again.", fields };

  // Signing deadline, put on every signer's schedule (with reminders) when asked.
  let dueAt: Date | null = null;
  if (schedule) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.dueDate) || !/^\d{2}:\d{2}$/.test(fields.dueTime)) {
      return { error: "Pick the date and time everyone should sign by.", fields };
    }
    dueAt = localStringToUtc(`${fields.dueDate}T${fields.dueTime}`, user.timezone);
    if (!dueAt) return { error: "That deadline isn't a valid date or time.", fields };
    if (dueAt.getTime() < Date.now() + 5 * 60_000) return { error: "The deadline has to be in the future.", fields };
  }

  const blank = form.get("blank") === "on";
  const file = form.get("file");
  if (!blank) {
    if (!(file instanceof File) || file.size === 0) return { error: 'Choose a PDF to upload, or tick "Use a blank page".', fields };
    if (file.size > uploadLimitBytes()) return { error: `That file is too large. The limit is ${formatMb(uploadLimitBytes())}.`, fields };
  }

  const db = getDb();
  const people = await db.user.findMany({
    where: { id: { in: signerIds } },
    select: { id: true, name: true, email: true, timezone: true },
  });
  if (people.length !== signerIds.length) return { error: "Someone you chose no longer has an account. Choose again.", fields };
  const signers = signerIds.map((id) => people.find((p) => p.id === id)!);
  if (!(await allowAttempt(`docsend:${user.id}`, 20, 3600))) return { error: "You've sent a lot of documents. Please wait a while.", fields };

  const upload = blank ? null : (file as File);
  const bytes = upload ? new Uint8Array(await upload.arrayBuffer()) : await createBlankPdf();
  let pageCount: number;
  try {
    ({ pageCount } = await inspectPdf(bytes));
  } catch (err) {
    return { error: (err as Error).message, fields };
  }

  // Where each person's signature goes (optional), marked on the page preview: {"<userId>": box}.
  const boxes = new Map<string, SignatureBox>();
  try {
    const raw = String(form.get("signatureBoxes") ?? "");
    if (raw && raw.length < 20_000) {
      for (const [id, value] of Object.entries(JSON.parse(raw) as Record<string, unknown>)) {
        const box = parseSignatureBox(value);
        if (box && signerIds.includes(id)) boxes.set(id, box);
      }
    }
  } catch {
    /* ignore a malformed value: signatures then go on the certificate pages only */
  }
  if ([...boxes.values()].some((b) => b.page >= pageCount)) return { error: "A signature box is on a page this PDF doesn't have. Mark it again.", fields };

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
        dueAt,
      },
      select: { id: true },
    });
    id = doc.id;
    await db.documentSigner.createMany({
      data: signers.map((s, position) => ({ documentId: id, userId: s.id, position, signatureBox: boxes.get(s.id) ?? undefined })),
    });
  } catch (err) {
    console.error("[documents] could not save", err);
    await deleteFile(fileKey).catch(() => {});
    return { error: "We couldn't save the document. Please try again.", fields };
  }

  // Put "Sign: <title>" on each signer's schedule at the deadline, in their own time zone. The usual
  // reminders (push + email) then go out before it. The event is removed once they sign or decline.
  if (dueAt) {
    for (const s of signers) {
      const w = utcToWall(dueAt, s.timezone);
      try {
        const event = await db.event.create({
          data: {
            userId: s.id,
            createdById: user.id,
            title: `Sign: ${parsed.data.title}`.slice(0, 150),
            notes: `${user.name} sent "${parsed.data.title}" for you to sign by this time.\nOpen it: ${documentLink(id)}`,
            startLocal: `${w.y}-${pad(w.m)}-${pad(w.d)}T${pad(w.h)}:${pad(w.mi)}`,
            timezone: s.timezone,
            startUtc: dueAt,
            leads: DEADLINE_LEADS,
            emailReminders: true,
          },
          select: { id: true },
        });
        await db.documentSigner.updateMany({ where: { documentId: id, userId: s.id }, data: { eventId: event.id } });
      } catch (err) {
        console.error("[documents] could not add the deadline to a schedule", err);
      }
    }
  }

  await audit("document_sent", user.id, `${id} to ${signerIds.join(",")}`);
  const fmtDue = (tz: string) =>
    dueAt ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(dueAt) : "";
  await Promise.all(
    signers
      .filter((s) => s.id !== user.id) // you're already looking at it
      .map((s) =>
        notifyUser(
          s.id,
          {
            title: `${user.name} sent you a document to sign`,
            body: `"${parsed.data.title}"${dueAt ? ` · sign by ${fmtDue(s.timezone)}` : ""}`,
            url: `/documents/${id}`,
            tag: `doc-${id}`,
          },
          {
            to: s.email,
            subject: `${user.name} sent you a document to sign: ${parsed.data.title}`,
            content: {
              heading: "A document is waiting for your signature",
              lines: [
                `Hi ${first(s.name)}, ${user.name} sent you "${parsed.data.title}" (${pageCount} ${pageCount === 1 ? "page" : "pages"}).`,
                ...(dueAt ? [`Please sign by ${fmtDue(s.timezone)}. It's on your schedule, with reminders.`] : []),
                ...(parsed.data.note ? [`Note from ${first(user.name)}: ${parsed.data.note}`] : []),
                "You'll be asked to share your location when you sign.",
              ],
              button: { text: "Review and sign", url: documentLink(id) },
              footer: "You need to be signed in to view and sign the document.",
            },
          },
        ),
      ),
  );
  revalidatePath("/documents");
  revalidatePath("/");
  redirect(`/documents/${id}?sent=1`);
}

// ------------------------------------------------------------------ sign
function readPng(dataUrl: string) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m || m[1].length > MAX_SIGNATURE_BYTES * 1.4) return null;
  const png = Buffer.from(m[1], "base64");
  const isPng = png.length > 100 && png.length <= MAX_SIGNATURE_BYTES && png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return isPng ? png : null;
}

/** My signer row on a document that is still open, with the sender. */
async function myOpenRow(documentId: string, userId: string) {
  return getDb().documentSigner.findFirst({
    where: { documentId, userId, status: "pending", document: { status: "pending" } },
    include: {
      document: {
        select: { id: true, title: true, sender: { select: { id: true, name: true, email: true } }, signers: { select: { status: true, userId: true } } },
      },
    },
  });
}

export async function signDocument(documentId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isObjectId(documentId)) return { error: "That document no longer exists." };
  const row = await myOpenRow(documentId, user.id);
  if (!row) return { error: "This document is no longer waiting for your signature." };
  const doc = row.document;
  if (form.get("agree") !== "on") return { error: "Tick the box to confirm you agree to sign electronically." };

  const kind = form.get("kind");
  let signatureData: string;
  if (kind === "drawn") {
    const png = readPng(String(form.get("drawn") ?? ""));
    if (!png) return { error: "Draw your signature in the box first." };
    signatureData = png.toString("base64");
  } else if (kind === "typed") {
    const text = String(form.get("typed") ?? "").replace(/\s+/g, " ").trim();
    if (text.length < 2 || text.length > 60) return { error: "Type your full name (2 to 60 characters)." };
    if (!canTypeSignature(text)) return { error: "Typed signatures only support Latin letters. Please draw your signature instead." };
    signatureData = text;
  } else {
    return { error: "Choose how you want to sign." };
  }

  // Location is compulsory: no GPS point from the signer's device, no signature.
  const evidence = parseEvidence(form.get("evidence"));
  if (!evidence.geo) {
    return { error: "Your location is required to sign. Allow location access for this site in your browser, then press Try again." };
  }
  if (!(await allowAttempt(`docsign:${user.id}`, 30, 3600))) return { error: "Too many attempts. Please wait a while." };

  const { ip, userAgent } = await clientInfo();
  // Turn the GPS point and the IP address into places in words (stored, shown to the sender, printed on the certificate).
  const place: Place = { ...(await ipPlaceFromHeaders()), address: await reverseGeocode(evidence.geo.lat, evidence.geo.lon) };

  // Only one answer can win: this updates the row only while it (and the document) are still pending.
  const { count } = await getDb().documentSigner.updateMany({
    where: { id: row.id, status: "pending" },
    data: {
      status: "signed",
      respondedAt: new Date(),
      signatureKind: kind,
      signatureData,
      ip,
      agent: userAgent,
      evidence,
      place: JSON.parse(JSON.stringify(place)),
    },
  });
  if (!count) return { error: "You already answered this document." };
  await audit("document_signed", user.id, doc.id);
  await removeSigningEvents(doc.id, user.id);

  let finished = false;
  try {
    finished = await finalizeIfComplete(doc.id);
  } catch (err) {
    // The signature is saved; the final PDF is built again when the document is next opened.
    console.error("[documents] could not build the signed PDF", err);
  }

  if (!finished && doc.sender.id !== user.id) {
    const done = doc.signers.filter((s) => s.status === "signed" || s.userId === user.id).length;
    await notifyUser(
      doc.sender.id,
      { title: `${user.name} signed "${doc.title}"`, body: `${done} of ${doc.signers.length} signed so far.`, url: `/documents/${doc.id}`, tag: `doc-${doc.id}` },
      {
        to: doc.sender.email,
        subject: `${user.name} signed "${doc.title}" (${done} of ${doc.signers.length})`,
        content: {
          heading: "A signature came in",
          lines: [`Hi ${first(doc.sender.name)}, ${user.name} signed "${doc.title}". ${done} of ${doc.signers.length} people have signed so far.`],
          button: { text: "Open the document", url: documentLink(doc.id) },
        },
      },
    );
  }
  revalidatePath("/documents");
  revalidatePath("/");
  redirect(`/documents/${doc.id}?signed=1`);
}

// ------------------------------------------------------------------ decline / cancel
export async function declineDocument(documentId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!isObjectId(documentId)) return { error: "That document no longer exists." };
  const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
  const row = await myOpenRow(documentId, user.id);
  if (!row) return { error: "This document is no longer waiting for your signature." };
  const doc = row.document;
  const db = getDb();
  const now = new Date();
  const { count } = await db.document.updateMany({ where: { id: doc.id, status: "pending" }, data: { status: "declined", respondedAt: now } });
  if (!count) return { error: "This document was already closed." };
  await db.documentSigner.update({ where: { id: row.id }, data: { status: "declined", respondedAt: now, declineReason: reason } });
  await removeSigningEvents(doc.id);

  await audit("document_declined", user.id, doc.id);
  const tell = await db.user.findMany({
    where: { id: { in: [doc.sender.id, ...doc.signers.map((s) => s.userId)].filter((id) => id !== user.id) } },
    select: { id: true, name: true, email: true },
  });
  // The sender is told who declined and why; other signers only that it closed (they never see who else signs).
  await Promise.all(
    tell.map((p) => {
      const toSender = p.id === doc.sender.id;
      return notifyUser(
        p.id,
        toSender
          ? { title: `${user.name} declined "${doc.title}"`, body: reason ? `Reason: ${reason}` : "The document can no longer be signed.", url: `/documents/${doc.id}`, tag: `doc-${doc.id}` }
          : { title: `"${doc.title}" was declined`, body: "You no longer need to sign it.", url: `/documents/${doc.id}`, tag: `doc-${doc.id}` },
        {
          to: p.email,
          subject: toSender ? `${user.name} declined to sign "${doc.title}"` : `No longer needed: "${doc.title}"`,
          content: toSender
            ? {
                heading: "The document was declined",
                lines: [`Hi ${first(p.name)}, ${user.name} declined to sign "${doc.title}", so it can no longer be signed.`, ...(reason ? [`Reason: ${reason}`] : [])],
                button: { text: "Open the document", url: documentLink(doc.id) },
              }
            : {
                heading: "You no longer need to sign this",
                lines: [`Hi ${first(p.name)}, "${doc.title}" was declined, so it can no longer be signed. Nothing more is needed from you.`],
                button: { text: "Open the document", url: documentLink(doc.id) },
              },
        },
      );
    }),
  );
  revalidatePath("/documents");
  revalidatePath("/");
  redirect(`/documents/${doc.id}?declined=1`);
}

export async function cancelDocument(documentId: string) {
  const user = await requireUser();
  if (!isObjectId(documentId)) redirect("/documents");
  const db = getDb();
  const { count } = await db.document.updateMany({
    where: { id: documentId, senderId: user.id, status: "pending" },
    data: { status: "cancelled", respondedAt: new Date() },
  });
  if (count) {
    await audit("document_cancelled", user.id, documentId);
    await removeSigningEvents(documentId);
    const doc = await db.document.findUnique({
      where: { id: documentId },
      select: { title: true, signers: { where: { status: "pending", userId: { not: user.id } }, select: { userId: true } } },
    });
    await Promise.all(
      (doc?.signers ?? []).map((s) =>
        notifyUser(s.userId, { title: `${user.name} cancelled "${doc!.title}"`, body: "You no longer need to sign it.", url: `/documents/${documentId}`, tag: `doc-${documentId}` }),
      ),
    );
  }
  revalidatePath("/documents");
  revalidatePath("/");
  redirect(`/documents/${documentId}`);
}

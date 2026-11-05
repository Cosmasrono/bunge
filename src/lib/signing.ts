import "server-only";
import { getDb } from "@/db";
import { parseEvidence } from "@/lib/evidence";
import { parsePlace } from "@/lib/geo";
import { APP_URL } from "@/lib/mail";
import { notifyUser } from "@/lib/notify";
import { buildSignedPdf, sha256Hex, type SignatureInput } from "@/lib/pdf";
import { parseSignatureBox } from "@/lib/signature-box";
import { deleteFile, getFile, newFileKey, putFile } from "@/lib/storage";

export const documentLink = (id: string) => `${APP_URL}/documents/${id}`;
const first = (name: string) => name.split(" ")[0];

/** Removes the "sign by" events still on people's schedules for this document (they answered, or it closed). */
export async function removeSigningEvents(documentId: string, onlyUserId?: string) {
  const db = getDb();
  const rows = await db.documentSigner.findMany({
    where: { documentId, eventId: { not: null }, ...(onlyUserId ? { userId: onlyUserId } : {}) },
    select: { id: true, eventId: true },
  });
  if (!rows.length) return;
  await db.event.deleteMany({ where: { id: { in: rows.map((r) => r.eventId!) } } });
  await db.documentSigner.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { eventId: null } });
}

function signatureOf(kind: string | null, data: string | null): SignatureInput | null {
  if (!data) return null;
  if (kind === "typed") return { kind: "typed", text: data };
  if (kind === "drawn") return { kind: "drawn", png: new Uint8Array(Buffer.from(data, "base64")) };
  return null;
}

type SignerRow = {
  signatureKind: string | null;
  signatureData: string | null;
  respondedAt: Date | null;
  ip: string | null;
  agent: string | null;
  evidence: unknown;
  place: unknown;
  signatureBox: unknown;
  user: { name: string; email: string; timezone: string };
};

/** One signer's stored answer, in the shape the PDF builder needs (null if their signature is missing). */
function toPdfSigner(s: SignerRow) {
  const signature = signatureOf(s.signatureKind, s.signatureData);
  if (!signature || !s.respondedAt) return null;
  return {
    name: s.user.name,
    email: s.user.email,
    signedAt: s.respondedAt,
    timezone: s.user.timezone,
    ip: s.ip ?? "",
    agent: s.agent ?? "",
    evidence: parseEvidence(JSON.stringify(s.evidence ?? null)),
    place: parsePlace(s.place),
    signature,
    box: parseSignatureBox(s.signatureBox),
  };
}

/**
 * A signer's own copy: the original with only their signature stamped, and only their certificate page.
 * Signers never see the other signers' names, signatures, locations or IP addresses; only the sender gets the
 * full copy. Built on request (and available as soon as this person has signed). Null if they haven't signed.
 */
export async function buildPersonalCopy(documentId: string, userId: string): Promise<Uint8Array | null> {
  const db = getDb();
  const doc = await db.document.findUnique({
    where: { id: documentId },
    include: {
      sender: { select: { name: true, email: true } },
      signers: { where: { userId, status: "signed" }, include: { user: { select: { name: true, email: true, timezone: true } } } },
    },
  });
  const row = doc?.signers[0];
  if (!doc || !row) return null;
  const original = new Uint8Array(await getFile(doc.fileKey));
  if (sha256Hex(original) !== doc.fileHash) return null;
  const signer = toPdfSigner(row);
  if (!signer) return null;
  return buildSignedPdf({
    original,
    title: doc.title,
    originalHash: doc.fileHash,
    sender: { name: doc.sender.name, email: doc.sender.email },
    signers: [signer],
    reference: doc.id.slice(-8).toUpperCase(),
  });
}

/**
 * When everyone has signed, builds the final PDF (all signatures plus a certificate page each), stores it and
 * marks the document signed. Safe to call any time and in parallel: only one call can close the document.
 * Returns true when this call finished the document.
 */
export async function finalizeIfComplete(documentId: string): Promise<boolean> {
  const db = getDb();
  const doc = await db.document.findFirst({
    where: { id: documentId, status: "pending" },
    include: {
      sender: { select: { id: true, name: true, email: true } },
      signers: { orderBy: { position: "asc" }, include: { user: { select: { id: true, name: true, email: true, timezone: true } } } },
    },
  });
  if (!doc || !doc.signers.length || doc.signers.some((s) => s.status !== "signed")) return false;

  const original = new Uint8Array(await getFile(doc.fileKey));
  if (sha256Hex(original) !== doc.fileHash) {
    console.error("[documents] stored file does not match its fingerprint", doc.id);
    return false;
  }
  const signers = doc.signers.flatMap((s) => {
    const one = toPdfSigner(s);
    return one ? [one] : [];
  });
  if (signers.length !== doc.signers.length) {
    console.error("[documents] a signer's signature is missing; can't finish", doc.id);
    return false;
  }

  const signed = await buildSignedPdf({
    original,
    title: doc.title,
    originalHash: doc.fileHash,
    sender: { name: doc.sender.name, email: doc.sender.email },
    signers,
    reference: doc.id.slice(-8).toUpperCase(),
  });
  const key = newFileKey();
  await putFile(key, signed);
  const { count } = await db.document.updateMany({
    where: { id: doc.id, status: "pending" },
    data: { status: "signed", respondedAt: new Date(), signedFileKey: key, signedHash: sha256Hex(signed) },
  });
  if (!count) {
    await deleteFile(key).catch(() => {});
    return false;
  }

  // Tell the sender and every signer that the fully signed copy is ready.
  const everyone = new Map([[doc.sender.id, doc.sender], ...doc.signers.map((s) => [s.user.id, s.user] as const)]);
  await Promise.all(
    [...everyone.values()].map((p) =>
      notifyUser(
        p.id,
        { title: `"${doc.title}" is fully signed`, body: "The signed PDF is ready to download.", url: `/documents/${doc.id}`, tag: `doc-${doc.id}` },
        {
          to: p.email,
          subject: `Signed by everyone: ${doc.title}`,
          content: {
            heading: "The document is fully signed",
            lines: [
              p.id === doc.sender.id
                ? `Hi ${first(p.name)}, all ${doc.signers.length} ${doc.signers.length === 1 ? "person" : "people"} signed "${doc.title}". The signed copy is ready to download.`
                : `Hi ${first(p.name)}, "${doc.title}" is now fully signed. Your signed copy is ready to download.`,
            ],
            button: { text: "Open the signed document", url: documentLink(doc.id) },
          },
        },
      ),
    ),
  );
  return true;
}

import "server-only";
import type { DocumentStatus, SignerStatus } from "@prisma/client";
import { getDb, isObjectId } from "@/db";

export const STATUS_LABEL: Record<DocumentStatus, string> = {
  pending: "Waiting for signatures",
  signed: "Signed by everyone",
  declined: "Declined",
  cancelled: "Cancelled",
};

export const SIGNER_LABEL: Record<SignerStatus, string> = {
  pending: "Waiting",
  signed: "Signed",
  declined: "Declined",
};

const people = { select: { id: true, name: true, email: true } } as const;
const withSigners = {
  sender: people,
  signers: { orderBy: { position: "asc" }, include: { user: people } },
} as const;

/**
 * Documents made before several signers were supported kept their one signer on the document itself.
 * Move those into DocumentSigner rows (once; the old field is then cleared), so all code reads one shape.
 */
async function upgradeLegacyDocuments(where: object) {
  const db = getDb();
  const legacy = await db.document.findMany({ where: { ...where, signerId: { not: null } } });
  for (const d of legacy) {
    try {
      await db.documentSigner.create({
        data: {
          documentId: d.id,
          userId: d.signerId!,
          position: 0,
          status: d.status === "signed" ? "signed" : d.status === "declined" ? "declined" : "pending",
          signatureBox: d.signatureBox ?? undefined,
          respondedAt: d.status === "signed" || d.status === "declined" ? d.respondedAt : null,
          declineReason: d.declineReason,
          signatureKind: d.signatureKind,
          ip: d.signerIp,
          agent: d.signerAgent,
          evidence: d.signerEvidence ?? undefined,
          place: d.signerPlace ?? undefined,
        },
      });
    } catch {
      /* already moved by a parallel request (unique documentId + userId) */
    }
    await db.document.update({ where: { id: d.id }, data: { signerId: null } });
  }
}

/** A document, only if this user sent it or is one of its signers. */
export async function getDocumentFor(userId: string, documentId: string) {
  if (!isObjectId(documentId) || !isObjectId(userId)) return null;
  await upgradeLegacyDocuments({ id: documentId });
  return getDb().document.findFirst({
    where: { id: documentId, OR: [{ senderId: userId }, { signers: { some: { userId } } }] },
    include: withSigners,
  });
}

export type DocumentWithSigners = NonNullable<Awaited<ReturnType<typeof getDocumentFor>>>;

export async function listDocumentsFor(userId: string) {
  if (!isObjectId(userId)) return { toSign: [], sent: [], received: [] };
  await upgradeLegacyDocuments({ OR: [{ senderId: userId }, { signerId: userId }] });
  const rows = await getDb().document.findMany({
    where: { OR: [{ senderId: userId }, { signers: { some: { userId } } }] },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: withSigners,
  });
  const mine = (d: (typeof rows)[number]) => d.signers.find((s) => s.userId === userId);
  const waitingOnMe = (d: (typeof rows)[number]) => d.status === "pending" && mine(d)?.status === "pending";
  return {
    toSign: rows.filter(waitingOnMe),
    sent: rows.filter((d) => d.senderId === userId),
    // Sent to me by someone else, and I've answered (or it's closed).
    received: rows.filter((d) => d.senderId !== userId && mine(d) && !waitingOnMe(d)),
  };
}

/** Everyone a document can be sent to (anyone with an account; the sender may include themselves). */
export async function listSigners() {
  return getDb().user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });
}

/** "2 of 3 signed" */
export function progressLabel(signers: { status: SignerStatus }[]) {
  const done = signers.filter((s) => s.status === "signed").length;
  return `${done} of ${signers.length} signed`;
}

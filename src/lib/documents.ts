import "server-only";
import type { DocumentStatus } from "@prisma/client";
import { getDb, isObjectId } from "@/db";

export const STATUS_LABEL: Record<DocumentStatus, string> = {
  pending: "Waiting for signature",
  signed: "Signed",
  declined: "Declined",
  cancelled: "Cancelled",
};

const people = { select: { id: true, name: true, email: true } } as const;

/** A document, only if this user sent it or has to sign it. */
export async function getDocumentFor(userId: string, documentId: string) {
  if (!isObjectId(documentId) || !isObjectId(userId)) return null;
  return getDb().document.findFirst({
    where: { id: documentId, OR: [{ senderId: userId }, { signerId: userId }] },
    include: { sender: people, signer: people },
  });
}

export async function listDocumentsFor(userId: string) {
  const rows = await getDb().document.findMany({
    where: { OR: [{ senderId: userId }, { signerId: userId }] },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { sender: people, signer: people },
  });
  return {
    toSign: rows.filter((d) => d.signerId === userId && d.status === "pending"),
    sent: rows.filter((d) => d.senderId === userId),
    received: rows.filter((d) => d.signerId === userId && d.status !== "pending"),
  };
}

/** Everyone a document can be sent to (anyone with an account except yourself). */
export async function listSigners(userId: string) {
  return getDb().user.findMany({
    where: { id: { not: userId } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });
}

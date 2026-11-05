import "server-only";
import { getDb } from "@/db";
import { sha256 } from "./crypto";

/** A valid (unused, unexpired) password-reset link, or null. */
export async function findValidReset(token: string) {
  if (!token || token.length > 100) return null;
  const reset = await getDb().passwordReset.findFirst({
    where: { tokenHash: sha256(token), usedAt: null, expiresAt: { gt: new Date() } },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!reset) return null;
  return { resetId: reset.id, userId: reset.user.id, email: reset.user.email, name: reset.user.name, purpose: reset.purpose };
}

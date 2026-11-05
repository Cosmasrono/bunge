import "server-only";
import { getDb } from "@/db";
import type { Prisma } from "@prisma/client";
import { sha256 } from "./crypto";

/**
 * "Not used yet". In MongoDB an optional field that was never set is missing from the document, and Prisma's
 * `usedAt: null` only matches an explicit null, so both cases are checked.
 */
export const UNUSED_RESET = { OR: [{ usedAt: null }, { usedAt: { isSet: false } }] } satisfies Prisma.PasswordResetWhereInput;

/** A valid (unused, unexpired) password-reset link, or null. */
export async function findValidReset(token: string) {
  if (!token || token.length > 100) return null;
  const reset = await getDb().passwordReset.findFirst({
    where: { tokenHash: sha256(token), expiresAt: { gt: new Date() }, ...UNUSED_RESET },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!reset) return null;
  return { resetId: reset.id, userId: reset.user.id, email: reset.user.email, name: reset.user.name, purpose: reset.purpose };
}

import { getCurrentUser } from "@/lib/auth/session";
import { getDocumentFor } from "@/lib/documents";
import { buildPersonalCopy } from "@/lib/signing";
import { getFile } from "@/lib/storage";

/**
 * Serves a document's PDF to the person who sent it or has to sign it, and nobody else.
 *   ?v=original (default) | ?v=signed     ?download=1 to save instead of showing in the page
 * "signed": the sender gets the full copy (everyone's signatures and certificates); a signer gets their own copy,
 * with only their signature and certificate, so nobody sees another signer's details.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/documents/[id]/file">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const doc = await getDocumentFor(user.id, id);
  if (!doc) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const signed = url.searchParams.get("v") === "signed";
  const isSender = doc.senderId === user.id;

  let bytes: Uint8Array;
  try {
    if (signed && !isSender) {
      const copy = await buildPersonalCopy(doc.id, user.id);
      if (!copy) return new Response("You haven't signed this document yet.", { status: 404 });
      bytes = new Uint8Array(copy);
    } else {
      const key = signed ? doc.signedFileKey : doc.fileKey;
      if (!key) return new Response("Not found", { status: 404 });
      bytes = new Uint8Array(await getFile(key));
    }
  } catch {
    return new Response("The file is missing from storage.", { status: 410 });
  }
  const base = doc.title.replace(/[^\w.\- ()]/g, "_").slice(0, 80) || "document";
  const name = `${base}${signed ? " (signed)" : ""}.pdf`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${url.searchParams.get("download") ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

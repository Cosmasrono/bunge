import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listSigners } from "@/lib/documents";
import { uploadLimitBytes } from "@/lib/pdf";
import { NewDocumentForm } from "./new-document-form";

export const metadata: Metadata = { title: "Send a document" };

export default async function NewDocumentPage() {
  const user = await requireUser();
  const signers = await listSigners(user.id);
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/documents" className="btn-ghost -ml-2 px-2">
        <ArrowLeft className="size-4" /> Documents
      </Link>
      <h1 className="mt-3 mb-1 text-2xl font-semibold tracking-tight">Send a document for signature</h1>
      <p className="mb-6 text-sm text-muted">The person you choose signs it online, and you get the signed copy back. You can also send it to yourself.</p>
      <NewDocumentForm signers={signers} meId={user.id} maxBytes={uploadLimitBytes()} />
    </div>
  );
}

import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { canSendDocuments } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { listSigners } from "@/lib/documents";
import { uploadLimitBytes } from "@/lib/pdf";
import { utcToWall } from "@/lib/time";
import { NewDocumentForm } from "./new-document-form";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Send a document" };

export default async function NewDocumentPage() {
  const user = await requireUser();
  if (!canSendDocuments(user)) {
    return (
      <div className="mx-auto max-w-2xl">
        <Link href="/documents" className="btn-ghost -ml-2 px-2">
          <ArrowLeft className="size-4" /> Documents
        </Link>
        <div className="card mt-4 p-6 text-sm text-muted">
          You don&apos;t have permission to send documents. A director or admin can allow it on the Team page.
        </div>
      </div>
    );
  }
  const signers = await listSigners();
  const w = utcToWall(new Date(), user.timezone);
  const today = `${w.y}-${String(w.m).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={{ href: "/documents", label: "Documents" }} title="Send a document" description="Choose a file, select your signers, and we'll keep everyone updated." />
      <NewDocumentForm signers={signers} meId={user.id} maxBytes={uploadLimitBytes()} today={today} />
    </div>
  );
}

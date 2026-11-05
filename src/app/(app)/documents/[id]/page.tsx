import { ArrowLeft, CheckCircle2, Download, ShieldCheck, XCircle } from "lucide-react";
import type { DocumentStatus } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelDocument } from "@/app/actions/documents";
import { ConfirmSubmit, Flash } from "@/components/client-bits";
import { requireUser } from "@/lib/auth/session";
import { getDocumentFor, STATUS_LABEL } from "@/lib/documents";
import { SignPanel } from "./sign-panel";

export const metadata: Metadata = { title: "Document" };

const STATUS_STYLE: Record<DocumentStatus, string> = {
  pending: "bg-warning-soft text-warning",
  signed: "bg-success-soft text-success",
  declined: "bg-danger-soft text-danger",
  cancelled: "",
};

const FLASH: Record<string, string> = {
  sent: "Sent. They'll get an email.",
  signed: "Signed. The sender has been notified.",
  declined: "You declined this document. The sender has been notified.",
};

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export default async function DocumentPage({ params, searchParams }: PageProps<"/documents/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const doc = await getDocumentFor(user.id, id);
  if (!doc) notFound();

  const sp = await searchParams;
  const flashKey = Object.keys(FLASH).find((k) => sp[k]);
  const isSigner = doc.signerId === user.id;
  const isSender = doc.senderId === user.id;
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: user.timezone, dateStyle: "medium", timeStyle: "short" });
  const view = doc.status === "signed" ? "signed" : "original";
  const file = `/api/documents/${doc.id}/file`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {flashKey && <Flash message={FLASH[flashKey]} />}

      <div>
        <Link href="/documents" className="btn-ghost -ml-2 px-2">
          <ArrowLeft className="size-4" /> Documents
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">{doc.title}</h1>
          <span className={`chip mt-1.5 ${STATUS_STYLE[doc.status]}`}>{STATUS_LABEL[doc.status]}</span>
        </div>
      </div>

      <section className="card p-5 sm:p-6">
        <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
          <Item label="From" value={`${doc.sender.name}${isSender ? " (you)" : ""}`} sub={doc.sender.email} />
          <Item label="To sign" value={`${doc.signer.name}${isSigner ? " (you)" : ""}`} sub={doc.signer.email} />
          <Item label="Sent" value={fmt.format(doc.createdAt)} />
          <Item label="File" value={`${doc.pageCount} ${doc.pageCount === 1 ? "page" : "pages"} · ${size(doc.fileSize)}`} sub={doc.fileName} />
          {doc.respondedAt && doc.status !== "pending" && (
            <Item label={doc.status === "signed" ? "Signed" : doc.status === "declined" ? "Declined" : "Cancelled"} value={fmt.format(doc.respondedAt)} />
          )}
        </dl>

        {doc.note && (
          <div className="mt-5 rounded-xl bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-medium text-faint">Message from {doc.sender.name.split(" ")[0]}</p>
            <p className="mt-1 whitespace-pre-wrap">{doc.note}</p>
          </div>
        )}
        {doc.status === "declined" && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            <XCircle className="mt-px size-4 shrink-0" />
            <span>{doc.declineReason ? <>Declined: {doc.declineReason}</> : "Declined without a message."}</span>
          </div>
        )}
        {doc.status === "signed" && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            <CheckCircle2 className="mt-px size-4 shrink-0" />
            <span>
              Signed by {doc.signer.name}. A signature certificate with the time, IP address and file fingerprint was added as the last page.
            </span>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {doc.status === "signed" && (
            <a href={`${file}?v=signed&download=1`} className="btn-primary btn-sm">
              <Download className="size-3.5" /> Download signed PDF
            </a>
          )}
          <a href={`${file}?download=1`} className="btn-secondary btn-sm">
            <Download className="size-3.5" /> {doc.status === "signed" ? "Original PDF" : "Download PDF"}
          </a>
          {isSender && doc.status === "pending" && (
            <form action={cancelDocument.bind(null, doc.id)}>
              <ConfirmSubmit message={`Cancel "${doc.title}"? ${doc.signer.name} will no longer be able to sign it.`} className="btn-danger btn-sm">
                Cancel request
              </ConfirmSubmit>
            </form>
          )}
        </div>
      </section>

      <section className="card overflow-hidden">
        <iframe
          src={`${file}?v=${view}#view=FitH`}
          title={`${doc.title} (PDF)`}
          className="block h-[70vh] min-h-[420px] w-full bg-surface-2"
        />
      </section>

      {isSigner && doc.status === "pending" && <SignPanel documentId={doc.id} signerName={user.name} />}

      {isSender && !isSigner && doc.status === "pending" && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <ShieldCheck className="size-4 text-faint" /> Waiting for {doc.signer.name} to sign. You&apos;ll get an email when they do.
        </p>
      )}
    </div>
  );
}

function Item({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-faint">{label}</dt>
      <dd className="mt-0.5 font-medium break-words">{value}</dd>
      {sub && <dd className="truncate text-xs text-muted">{sub}</dd>}
    </div>
  );
}

import { ChevronRight, FilePlus2, FileText, PenLine } from "lucide-react";
import type { DocumentStatus } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listDocumentsFor, STATUS_LABEL } from "@/lib/documents";

export const metadata: Metadata = { title: "Documents" };

const STATUS_STYLE: Record<DocumentStatus, string> = {
  pending: "bg-warning-soft text-warning",
  signed: "bg-success-soft text-success",
  declined: "bg-danger-soft text-danger",
  cancelled: "",
};

type Row = Awaited<ReturnType<typeof listDocumentsFor>>["sent"][number];

export default async function DocumentsPage() {
  const user = await requireUser();
  const { toSign, sent, received } = await listDocumentsFor(user.id);
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: user.timezone, day: "numeric", month: "short", year: "numeric" });
  const empty = !toSign.length && !sent.length && !received.length;

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="mt-1 text-sm text-muted">Send a PDF to a colleague to sign, or sign what was sent to you.</p>
        </div>
        <Link href="/documents/new" className="btn-primary shrink-0">
          <FilePlus2 className="size-4" /> <span className="hidden sm:inline">Send a document</span>
          <span className="sm:hidden">New</span>
        </Link>
      </div>

      {empty && (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <FileText className="size-6" />
          </span>
          <h2 className="mt-4 font-semibold">No documents yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted">Upload a PDF and choose who has to sign it. They&apos;ll get an email, and you&apos;ll get the signed copy back.</p>
          <Link href="/documents/new" className="btn-primary mt-5">
            Send your first document
          </Link>
        </div>
      )}

      {toSign.length > 0 && (
        <Section title="Waiting for your signature" count={toSign.length} highlight>
          {toSign.map((d) => (
            <DocRow key={d.id} doc={d} line={`From ${d.sender.name}`} date={fmt.format(d.createdAt)} action />
          ))}
        </Section>
      )}

      {sent.length > 0 && (
        <Section title="Sent by you" count={sent.length}>
          {sent.map((d) => (
            <DocRow key={d.id} doc={d} line={`To ${d.signer.name}`} date={fmt.format(d.createdAt)} />
          ))}
        </Section>
      )}

      {received.length > 0 && (
        <Section title="Sent to you · answered" count={received.length}>
          {received.map((d) => (
            <DocRow key={d.id} doc={d} line={`From ${d.sender.name}`} date={fmt.format(d.respondedAt ?? d.createdAt)} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, highlight, children }: { title: string; count: number; highlight?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted">
        {title}
        <span className={`rounded-full px-2 py-0.5 text-xs ${highlight ? "bg-primary text-primary-text" : "bg-surface-2"}`}>{count}</span>
      </h2>
      <ul className={`card divide-y divide-border overflow-hidden ${highlight ? "ring-2 ring-primary/25" : ""}`}>{children}</ul>
    </section>
  );
}

function DocRow({ doc, line, date, action }: { doc: Row; line: string; date: string; action?: boolean }) {
  return (
    <li>
      <Link href={`/documents/${doc.id}`} className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-surface-2 sm:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <FileText className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{doc.title}</span>
          <span className="mt-0.5 block truncate text-sm text-muted">
            {line} · {date}
          </span>
        </span>
        {action ? (
          <span className="chip bg-primary text-primary-text">
            <PenLine className="size-3" /> Sign
          </span>
        ) : (
          <span className={`chip ${STATUS_STYLE[doc.status]}`}>{STATUS_LABEL[doc.status]}</span>
        )}
        <ChevronRight className="size-4 shrink-0 text-faint" />
      </Link>
    </li>
  );
}

import { ChevronRight, FilePlus2, FileText, PenLine } from "lucide-react";
import type { DocumentStatus } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { canSendDocuments } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { listDocumentsFor, progressLabel, STATUS_LABEL } from "@/lib/documents";

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
  const canSend = canSendDocuments(user);
  const { toSign, sent, received } = await listDocumentsFor(user.id);
  const mine = (d: Row) => d.signers.find((s) => s.userId === user.id);
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: user.timezone, day: "numeric", month: "short", year: "numeric" });
  const empty = !toSign.length && !sent.length && !received.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]">Documents</h1>
          <p className="mt-2 max-w-lg text-sm text-muted">Send, sign, and keep track of your documents in one place.</p>
        </div>
        {canSend && (
          <Link href="/documents/new" className="btn-primary shrink-0">
            <FilePlus2 className="size-4" /> Send a document
          </Link>
        )}
      </div>

      {!empty && <dl className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: "To sign", value: toSign.length, style: "text-accent" },
          { label: "Sent by you", value: sent.length, style: "text-primary" },
          { label: "Answered by you", value: received.length, style: "text-success" },
        ].map(({ label, value, style }) => <div key={label} className="card p-3 sm:p-5"><dt className="text-xs font-medium text-muted">{label}</dt><dd className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl ${style}`}>{value}</dd></div>)}
      </dl>}

      {empty && (
        <div className="card flex flex-col items-center px-6 py-16 text-center sm:py-20">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <FileText className="size-6" />
          </span>
          <h2 className="mt-4 font-semibold">No documents yet</h2>
          {canSend ? (
            <>
              <p className="mt-1 max-w-sm text-sm text-muted">Upload a PDF and choose who has to sign it. They&apos;ll get an email, and you&apos;ll get the signed copy back.</p>
              <Link href="/documents/new" className="btn-primary mt-5">
                Send your first document
              </Link>
            </>
          ) : (
            <p className="mt-1 max-w-sm text-sm text-muted">Documents sent to you for signing appear here. To send documents yourself, ask a director or admin to allow it.</p>
          )}
        </div>
      )}

      {toSign.length > 0 && (
        <Section title="Waiting for your signature" count={toSign.length} highlight>
          {toSign.map((d) => (
            <DocRow key={d.id} doc={d} viewerId={user.id} line={`From ${d.sender.name}`} date={fmt.format(d.createdAt)} action />
          ))}
        </Section>
      )}

      {sent.length > 0 && (
        <Section title="Sent by you" count={sent.length}>
          {sent.map((d) => (
            <DocRow key={d.id} doc={d} viewerId={user.id} asSender line={`To ${names(d.signers.map((s) => s.user.name))}`} date={fmt.format(d.createdAt)} />
          ))}
        </Section>
      )}

      {received.length > 0 && (
        <Section title="Sent to you · answered" count={received.length}>
          {received.map((d) => (
            <DocRow key={d.id} doc={d} viewerId={user.id} line={`From ${d.sender.name}`} date={fmt.format(mine(d)?.respondedAt ?? d.respondedAt ?? d.createdAt)} />
          ))}
        </Section>
      )}
    </div>
  );
}

/** "Ann", "Ann and Bo", "Ann, Bo and 2 others" */
function names(list: string[]) {
  if (list.length <= 2) return list.join(" and ");
  return `${list.slice(0, 2).join(", ")} and ${list.length - 2} ${list.length === 3 ? "other" : "others"}`;
}

function Section({ title, count, highlight, children }: { title: string; count: number; highlight?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted">
        {title}
        <span className={`rounded-full px-2 py-0.5 text-xs ${highlight ? "bg-accent text-accent-text" : "bg-surface-2"}`}>{count}</span>
      </h2>
      <ul className={`card divide-y divide-border overflow-hidden ${highlight ? "ring-2 ring-accent/30" : ""}`}>{children}</ul>
    </section>
  );
}

/**
 * One document in a list. The sender sees overall progress ("2 of 3 signed"); a signer sees only their own answer,
 * never who else signs or how far they are.
 */
function DocRow({ doc, viewerId, asSender, line, date, action }: { doc: Row; viewerId: string; asSender?: boolean; line: string; date: string; action?: boolean }) {
  const own = doc.signers.find((s) => s.userId === viewerId);
  const chip = asSender
    ? { label: doc.status === "pending" && doc.signers.length > 1 ? progressLabel(doc.signers) : STATUS_LABEL[doc.status], style: STATUS_STYLE[doc.status] }
    : doc.status === "cancelled"
      ? { label: "Cancelled", style: STATUS_STYLE.cancelled }
      : own?.status === "signed"
        ? { label: "You signed", style: STATUS_STYLE.signed }
        : own?.status === "declined"
          ? { label: "You declined", style: STATUS_STYLE.declined }
          : doc.status === "declined"
            ? { label: "Closed", style: STATUS_STYLE.cancelled }
            : { label: STATUS_LABEL[doc.status], style: STATUS_STYLE[doc.status] };
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
          <span className="chip bg-accent text-accent-text">
            <PenLine className="size-3" /> Sign
          </span>
        ) : (
          <span className={`chip ${chip.style}`}>{chip.label}</span>
        )}
        <ChevronRight className="size-4 shrink-0 text-faint" />
      </Link>
    </li>
  );
}

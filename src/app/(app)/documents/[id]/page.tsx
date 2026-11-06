import { ArrowLeft, CalendarClock, CheckCircle2, Clock, Download, MapPin, ShieldCheck, XCircle } from "lucide-react";
import type { DocumentStatus, SignerStatus } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelDocument } from "@/app/actions/documents";
import { ConfirmSubmit, Flash } from "@/components/client-bits";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { getDocumentFor, progressLabel, SIGNER_LABEL, STATUS_LABEL, type DocumentWithSigners } from "@/lib/documents";
import { describeAgent, describeGeo, mapLink, parseEvidence } from "@/lib/evidence";
import { describeIpPlace, parsePlace, reverseGeocode } from "@/lib/geo";
import { parseSignatureBox } from "@/lib/signature-box";
import { finalizeIfComplete } from "@/lib/signing";
import { SignPanel } from "./sign-panel";

export const metadata: Metadata = { title: "Document" };

const STATUS_STYLE: Record<DocumentStatus, string> = {
  pending: "bg-warning-soft text-warning",
  signed: "bg-success-soft text-success",
  declined: "bg-danger-soft text-danger",
  cancelled: "",
};

const SIGNER_STYLE: Record<SignerStatus, string> = {
  pending: "bg-warning-soft text-warning",
  signed: "bg-success-soft text-success",
  declined: "bg-danger-soft text-danger",
};

const FLASH: Record<string, string> = {
  sent: "Sent. Everyone who has to sign has been notified.",
  signed: "Signed. The sender has been notified.",
  declined: "You declined this document. The sender has been notified.",
};

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export default async function DocumentPage({ params, searchParams }: PageProps<"/documents/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  let doc = await getDocumentFor(user.id, id);
  if (!doc) notFound();

  // Everyone signed but the final PDF wasn't made (e.g. the server stopped mid-way): make it now.
  if (doc.status === "pending" && doc.signers.length && doc.signers.every((s) => s.status === "signed")) {
    try {
      if (await finalizeIfComplete(doc.id)) doc = (await getDocumentFor(user.id, id))!;
    } catch (err) {
      console.error("[documents] could not finish the document", err);
    }
  }

  const sp = await searchParams;
  const flashKey = Object.keys(FLASH).find((k) => sp[k]);
  const me = doc.signers.find((s) => s.userId === user.id);
  const isSender = doc.senderId === user.id;
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: user.timezone, dateStyle: "medium", timeStyle: "short" });
  const file = `/api/documents/${doc.id}/file`;
  const decliner = doc.signers.find((s) => s.status === "declined");
  const waitingFor = doc.signers.filter((s) => s.status === "pending");
  const multi = doc.signers.length > 1;
  // Privacy: the sender sees every signer; a signer sees only their own row, never who else signs.
  const visible = isSender ? doc.signers : doc.signers.filter((s) => s.userId === user.id);
  // The sender's "signed" copy has everyone's signatures; a signer's has only their own (see the file route).
  const hasSignedCopy = isSender ? doc.status === "signed" : me?.status === "signed";
  const view = hasSignedCopy ? "signed" : "original";
  const chip = isSender
    ? { label: doc.status === "pending" && multi ? progressLabel(doc.signers) : STATUS_LABEL[doc.status], style: STATUS_STYLE[doc.status] }
    : doc.status === "cancelled"
      ? { label: "Cancelled", style: STATUS_STYLE.cancelled }
      : me?.status === "signed"
        ? { label: "You signed", style: STATUS_STYLE.signed }
        : me?.status === "declined"
          ? { label: "You declined", style: STATUS_STYLE.declined }
          : doc.status === "declined"
            ? { label: "Closed", style: STATUS_STYLE.cancelled }
            : { label: "Waiting for your signature", style: STATUS_STYLE.pending };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {flashKey && <Flash message={FLASH[flashKey]} />}

      <div>
        <Link href="/documents" className="btn-ghost -ml-2 px-2">
          <ArrowLeft className="size-4" /> Documents
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">{doc.title}</h1>
          <span className={`chip mt-1.5 ${chip.style}`}>{chip.label}</span>
        </div>
      </div>

      <section className="card p-5 sm:p-6">
        <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
          <Item label="From" value={`${doc.sender.name}${isSender ? " (you)" : ""}`} sub={doc.sender.email} />
          <Item label="Sent" value={fmt.format(doc.createdAt)} />
          <Item label="File" value={`${doc.pageCount} ${doc.pageCount === 1 ? "page" : "pages"} · ${size(doc.fileSize)}`} sub={doc.fileName} />
          {doc.dueAt && <Item label="Sign by" value={fmt.format(doc.dueAt)} sub={isSender ? "On each signer's schedule, with reminders" : "On your schedule, with reminders"} />}
          {doc.respondedAt && doc.status !== "pending" && (
            <Item label={doc.status === "signed" ? "Completed" : doc.status === "declined" ? "Declined" : "Cancelled"} value={fmt.format(doc.respondedAt)} />
          )}
        </dl>

        <h2 className="mt-6 mb-2 text-xs font-medium text-faint">{!isSender ? "Your signature" : multi ? `Signers (${doc.signers.length})` : "Signer"}</h2>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {visible.map((s, i) => {
            const box = parseSignatureBox(s.signatureBox);
            return (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                {isSender && <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-muted">{i + 1}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {s.user.name}
                    {s.userId === user.id && <span className="font-normal text-faint"> (you)</span>}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {s.status === "signed" && s.respondedAt
                      ? `Signed ${fmt.format(s.respondedAt)}`
                      : s.status === "declined"
                        ? `Declined${s.declineReason ? `: ${s.declineReason}` : ""}`
                        : box
                          ? `Signs on page ${box.page + 1}`
                          : "Chooses the spot when signing"}
                  </span>
                </span>
                <span className={`chip ${SIGNER_STYLE[s.status]}`}>
                  {s.status === "signed" ? <CheckCircle2 className="size-3" /> : s.status === "pending" ? <Clock className="size-3" /> : <XCircle className="size-3" />}
                  {SIGNER_LABEL[s.status]}
                </span>
              </li>
            );
          })}
        </ul>

        {doc.note && (
          <div className="mt-5 rounded-xl bg-surface-2 px-4 py-3 text-sm">
            <p className="text-xs font-medium text-faint">Message from {doc.sender.name.split(" ")[0]}</p>
            <p className="mt-1 whitespace-pre-wrap">{doc.note}</p>
          </div>
        )}
        {doc.status === "declined" && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            <XCircle className="mt-px size-4 shrink-0" />
            <span>
              {isSender || decliner?.userId === user.id ? (
                <>
                  {decliner ? `${decliner.userId === user.id ? "You" : decliner.user.name} declined` : "Declined"}
                  {decliner?.declineReason ? `: ${decliner.declineReason}.` : "."} The document can no longer be signed.
                </>
              ) : (
                "This document was declined, so it can no longer be signed."
              )}
            </span>
          </div>
        )}
        {isSender && doc.status === "signed" && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            <CheckCircle2 className="mt-px size-4 shrink-0" />
            <span>
              Signed by {multi ? `all ${doc.signers.length} people` : doc.signers[0]?.user.name}. A signature certificate {multi ? "page for each signer" : "page"} with the
              time, location, IP address and file fingerprint was added at the end.
            </span>
          </div>
        )}

        {!isSender && me?.status === "signed" && (
          <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            <CheckCircle2 className="mt-px size-4 shrink-0" />
            <span>
              You signed{me.respondedAt ? ` on ${fmt.format(me.respondedAt)}` : ""}. Your copy has your signature and your signature certificate. The sender
              keeps the complete record.
            </span>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {hasSignedCopy && (
            <a href={`${file}?v=signed&download=1`} className="btn-primary btn-sm">
              <Download className="size-3.5" /> {isSender ? "Download signed PDF" : "Download my signed copy"}
            </a>
          )}
          <a href={`${file}?download=1`} className="btn-secondary btn-sm">
            <Download className="size-3.5" /> {hasSignedCopy ? "Original PDF" : "Download PDF"}
          </a>
          {isSender && doc.status === "pending" && (
            <form action={cancelDocument.bind(null, doc.id)}>
              <ConfirmSubmit message={`Cancel "${doc.title}"? Nobody will be able to sign it any more.`} className="btn-danger btn-sm">
                Cancel request
              </ConfirmSubmit>
            </form>
          )}
        </div>
      </section>

      {isSender && doc.signers.some((s) => s.status === "signed") && <SigningDetails doc={doc} fmt={fmt} />}

      <section className="card overflow-hidden">
        <iframe src={`${file}?v=${view}#view=FitH`} title={`${doc.title} (PDF)`} className="block h-[70vh] min-h-[420px] w-full bg-surface-2" />
      </section>

      {me?.status === "pending" && doc.status === "pending" && (
        <SignPanel documentId={doc.id} signerName={user.name} userId={user.id} fixedBox={parseSignatureBox(me.signatureBox)} />
      )}

      {isSender && doc.status === "pending" && waitingFor.some((s) => s.userId !== user.id) && (
        <p className="flex items-center gap-2 text-sm text-muted">
          {doc.dueAt ? <CalendarClock className="size-4 shrink-0 text-faint" /> : <ShieldCheck className="size-4 shrink-0 text-faint" />}
          Waiting for {waitingFor.map((s) => s.user.name).join(", ")} to sign. You&apos;ll get a notification as each signature comes in.
        </p>
      )}
    </div>
  );
}

/** Proof of signing, one block per person who signed. Only the person who sent the document sees this. */
function SigningDetails({ doc, fmt }: { doc: DocumentWithSigners; fmt: Intl.DateTimeFormat }) {
  const signed = doc.signers.filter((s) => s.status === "signed");
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="size-4 text-faint" /> How it was signed
      </h2>
      <p className="mt-1 text-sm text-muted">Only you, as the sender, can see these details.</p>
      <div className="mt-4 space-y-3">
        {signed.map((s, i) => (
          <details key={s.id} open={signed.length === 1 || i === signed.length - 1} className="rounded-xl border border-border">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
              {s.user.name}
              <span className="text-xs font-normal text-muted">{s.respondedAt ? fmt.format(s.respondedAt) : ""}</span>
            </summary>
            <div className="border-t border-border px-4 pt-4 pb-5">
              <SignerProof row={s} fmt={fmt} />
            </div>
          </details>
        ))}
      </div>
      <p className="mt-4 text-xs text-faint">
        GPS location and device details are reported by each signer&apos;s device with their consent. Time, IP address and IP location are recorded by the server.
      </p>
    </section>
  );
}

async function SignerProof({ row, fmt }: { row: DocumentWithSigners["signers"][number]; fmt: Intl.DateTimeFormat }) {
  const ev = parseEvidence(JSON.stringify(row.evidence ?? null));
  let place = parsePlace(row.place);
  // Signed before the address lookup worked: find the address once and keep it.
  if (ev.geo && !place.address) {
    const address = await reverseGeocode(ev.geo.lat, ev.geo.lon);
    if (address) {
      place = { ...place, address };
      await getDb().documentSigner.update({ where: { id: row.id }, data: { place: JSON.parse(JSON.stringify(place)) } });
    }
  }
  const map = mapLink(ev);
  const ipPlace = describeIpPlace(place);
  const device = [ev.platform, ev.screen, ev.language].filter(Boolean).join(" · ");
  return (
    <>
      <div className="rounded-xl bg-surface-2 px-4 py-3.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-faint">
          <MapPin className="size-3.5" /> Where it was signed
        </p>
        <p className="mt-1 font-medium break-words">{place.address ?? (ev.geo ? "Address not found for this point" : "No location was shared")}</p>
        {ev.geo && (
          <p className="mt-1 text-xs text-muted">
            GPS {describeGeo(ev)}
            {map && (
              <>
                {" · "}
                <a href={map} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline">
                  View on a map
                </a>
              </>
            )}
          </p>
        )}
        {place.address && <p className="mt-1 text-[11px] text-faint">Address data © OpenStreetMap contributors</p>}
      </div>
      <dl className="mt-4 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
        <Item label="Signed at" value={row.respondedAt ? fmt.format(row.respondedAt) : "-"} sub="Recorded by the server" />
        <Item label="IP address" value={row.ip ?? "Not recorded"} sub={ipPlace ? `Around ${ipPlace} (approximate)` : "IP location not available"} />
        <Item label="Browser" value={describeAgent(row.agent)} sub="Recorded by the server" />
        <Item label="Device" value={device || "Not reported"} sub={ev.touch === undefined ? undefined : ev.touch ? "Touch screen" : "No touch screen"} />
        <Item label="Device ID" value={ev.deviceId ?? "Not reported"} sub="Random ID kept in the signer's browser" />
        <Item label="Signature" value={row.signatureKind === "typed" ? "Typed name" : row.signatureKind === "drawn" ? "Drawn" : "-"} />
      </dl>
    </>
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

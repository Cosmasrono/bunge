import { ArrowLeft, CheckCircle2, Download, MapPin, ShieldCheck, XCircle } from "lucide-react";
import type { DocumentStatus } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelDocument } from "@/app/actions/documents";
import { ConfirmSubmit, Flash } from "@/components/client-bits";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { getDocumentFor, STATUS_LABEL } from "@/lib/documents";
import { describeAgent, describeGeo, mapLink, parseEvidence } from "@/lib/evidence";
import { describeIpPlace, parsePlace, reverseGeocode } from "@/lib/geo";
import { parseSignatureBox } from "@/lib/signature-box";
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
  const box = parseSignatureBox(doc.signatureBox);

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
          <Item
            label="Signature goes"
            value={box ? `On page ${box.page + 1}, in the marked box` : "On a certificate page at the end"}
            sub={box ? "A certificate page is also added at the end" : undefined}
          />
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

      {doc.status === "signed" && isSender && <SigningDetails doc={doc} fmt={fmt} />}

      <section className="card overflow-hidden">
        <iframe
          src={`${file}?v=${view}#view=FitH`}
          title={`${doc.title} (PDF)`}
          className="block h-[70vh] min-h-[420px] w-full bg-surface-2"
        />
      </section>

      {isSigner && doc.status === "pending" && <SignPanel documentId={doc.id} signerName={user.name} requireLocation={process.env.REQUIRE_SIGNER_LOCATION === "true"} />}

      {isSender && !isSigner && doc.status === "pending" && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <ShieldCheck className="size-4 text-faint" /> Waiting for {doc.signer.name} to sign. You&apos;ll get an email when they do.
        </p>
      )}
    </div>
  );
}

/** Proof of signing. Only the person who sent the document sees this. */
async function SigningDetails({ doc, fmt }: { doc: NonNullable<Awaited<ReturnType<typeof getDocumentFor>>>; fmt: Intl.DateTimeFormat }) {
  const ev = parseEvidence(JSON.stringify(doc.signerEvidence ?? null));
  let place = parsePlace(doc.signerPlace);
  // Documents signed before addresses were looked up: find the address once and keep it.
  if (ev.geo && !place.address) {
    const address = await reverseGeocode(ev.geo.lat, ev.geo.lon);
    if (address) {
      place = { ...place, address };
      await getDb().document.update({ where: { id: doc.id }, data: { signerPlace: JSON.parse(JSON.stringify(place)) } });
    }
  }
  const map = mapLink(ev);
  const ipPlace = describeIpPlace(place);
  const device = [ev.platform, ev.screen, ev.language].filter(Boolean).join(" · ");
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="size-4 text-faint" /> How it was signed
      </h2>
      <p className="mt-1 text-sm text-muted">Only you, as the sender, can see these details.</p>

      <div className="mt-5 rounded-xl bg-surface-2 px-4 py-3.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-faint">
          <MapPin className="size-3.5" /> Where it was signed
        </p>
        <p className="mt-1 font-medium break-words">{place.address ?? (ev.geo ? "Address not found for this point" : "The signer didn't share their location")}</p>
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

      <dl className="mt-5 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
        <Item label="Signed at" value={doc.respondedAt ? fmt.format(doc.respondedAt) : "-"} sub="Recorded by the server" />
        <Item label="IP address" value={doc.signerIp ?? "Not recorded"} sub={ipPlace ? `Around ${ipPlace} (approximate)` : "IP location not available"} />
        <Item label="Browser" value={describeAgent(doc.signerAgent)} sub="Recorded by the server" />
        <Item label="Device" value={device || "Not reported"} sub={ev.touch === undefined ? undefined : ev.touch ? "Touch screen" : "No touch screen"} />
        <Item label="Device ID" value={ev.deviceId ?? "Not reported"} sub="Random ID kept in the signer's browser" />
        <Item label="Device time zone" value={ev.timezone ?? "Not reported"} />
      </dl>
      <p className="mt-4 text-xs text-faint">
        GPS location and device details are reported by the signer&apos;s device with their consent. Time, IP address and IP location are recorded by the server.
      </p>
    </section>
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

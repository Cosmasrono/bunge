"use client";

import { CalendarClock, ChevronDown, FileUp, FileText, MapPin, Search, Users } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { createDocument } from "@/app/actions/documents";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { SectionHeading } from "@/components/page-header";
import { SignatureBoxPicker } from "./signature-box-picker";

type Signer = { id: string; name: string; email: string; role: string };

export function NewDocumentForm({ signers, meId, maxBytes, today }: { signers: Signer[]; meId: string; maxBytes: number; today: string }) {
  const maxLabel = `${Math.round((maxBytes / 1024 / 1024) * 10) / 10} MB`;
  const [sizeError, setSizeError] = useState("");
  const [state, action] = useActionState(createDocument, undefined);
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [blank, setBlank] = useState(false);
  const f = state?.fields;
  // Chosen signers, in the order they were ticked (that order is used on the certificate pages).
  const [chosen, setChosen] = useState<string[]>(() => (f?.signerIds ? f.signerIds.split(",").filter((id) => signers.some((s) => s.id === id)) : []));
  const [schedule, setSchedule] = useState(f?.schedule === "on");
  const [query, setQuery] = useState("");
  const visibleSigners = signers.filter((person) => `${person.name} ${person.email}`.toLowerCase().includes(query.toLowerCase().trim()));
  const toggle = (id: string, on: boolean) => setChosen((cur) => (on ? [...cur.filter((x) => x !== id), id] : cur.filter((x) => x !== id)));
  const allChosen = signers.length > 0 && chosen.length === signers.length;
  const chosenPeople = chosen.map((id) => signers.find((s) => s.id === id)!).filter(Boolean).map((s) => ({ id: s.id, name: s.id === meId ? `${s.name} (you)` : s.name }));

  return (
    <form action={action} className="space-y-6">
      <FormMessage error={sizeError || state?.error} />
      {chosen.map((id) => <input key={id} type="hidden" name="signerIds" value={id} />)}
      <section className="card space-y-5 p-5 sm:p-6">
        <SectionHeading step="01" title="Choose your document" description="Upload a PDF or start with a blank page." />
        <Field label="Document title" htmlFor="title">
          <input id="title" name="title" required maxLength={150} className="input" placeholder="e.g. Q4 budget approval" defaultValue={f?.title} />
        </Field>

      <label className="flex items-start gap-3 rounded-xl bg-surface-2/60 px-4 py-3 text-sm">
        <input
          type="checkbox"
          name="blank"
          checked={blank}
          onChange={(e) => { setBlank(e.target.checked); if (e.target.checked) setSizeError(""); }}
          className="mt-0.5 size-4 shrink-0 accent-(--primary)"
        />
        <span>
          <span className="flex items-center gap-1.5 font-medium">
            <FileText className="size-4 text-faint" /> Use a blank page
          </span>
          <span className="block text-xs text-faint">No PDF needed. We create a plain white A4 page that just needs a signature.</span>
        </span>
      </label>

      {!blank && (
        <Field label="PDF file" htmlFor="file" hint={`PDF only, up to ${maxLabel}, not password-protected.`}>
          <label
            htmlFor="file"
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-surface-2/60 px-4 py-4 text-sm transition-colors hover:border-primary hover:bg-primary-soft/40 focus-within:ring-4 focus-within:ring-(--ring)"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <FileUp className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{fileName || "Choose a PDF…"}</span>
              <span className="block text-xs text-faint">{fileName ? "Click to choose a different file" : "Click to browse your files"}</span>
            </span>
            <input
              id="file"
              name="file"
              type="file"
              accept="application/pdf,.pdf"
              required
              className="sr-only"
              onChange={(e) => {
                let chosen = e.target.files?.[0] ?? null;
                if (chosen && chosen.size > maxBytes) {
                  setSizeError(`"${chosen.name}" is too large (${Math.round((chosen.size / 1024 / 1024) * 10) / 10} MB). The limit is ${maxLabel}. Try a smaller or compressed PDF.`);
                  e.target.value = "";
                  chosen = null;
                } else setSizeError("");
                setFileName(chosen?.name ?? "");
                setFile(chosen);
              }}
            />
          </label>
        </Field>
      )}

      </section>

      <section className="card space-y-5 p-5 sm:p-6">
      <SectionHeading step="02" title="Choose who signs" description="Each person receives a request. You'll be notified when they sign." />
      <fieldset className="space-y-2">
        <legend className="sr-only">Document signers</legend>
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-sm font-medium"><Users className="size-4 text-faint" /> {chosen.length} selected</p>
          {signers.length > 1 && (
            <button type="button" onClick={() => setChosen(allChosen ? [] : signers.map((s) => s.id))} className="btn-ghost btn-sm">
              {allChosen ? "Clear all" : "Select everyone"}
            </button>
          )}
        </div>
        <div className="relative"><Search aria-hidden className="absolute top-4 left-3.5 size-4 text-faint" /><input type="search" aria-label="Search people to sign" placeholder="Search by name or email" value={query} onChange={(event) => setQuery(event.target.value)} className="input pl-10" /></div>
        <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
          {visibleSigners.map((s) => {
            const n = chosen.indexOf(s.id);
            return (
              <li key={s.id}>
                <label className={`flex cursor-pointer items-center gap-3 px-4 py-3.5 text-sm transition-colors ${n >= 0 ? "bg-primary-soft/60" : "hover:bg-surface-2/60"}`}>
                  <input
                    type="checkbox"
                    value={s.id}
                    checked={n >= 0}
                    onChange={(e) => toggle(s.id, e.target.checked)}
                    className="size-4 shrink-0 accent-(--primary)"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {s.name}
                      {s.id === meId && <span className="font-normal text-faint"> (you)</span>}
                    </span>
                    <span className="block truncate text-xs text-faint">
                      {s.role} · {s.email}
                    </span>
                  </span>
                  {n >= 0 && <span className="chip bg-primary-soft text-primary">{n + 1}</span>}
                </label>
              </li>
            );
          })}
          {!visibleSigners.length && <li className="px-4 py-7 text-center text-sm text-muted">{signers.length ? "No people match your search." : "No signers are available yet. Ask an administrator to add your team."}</li>}
        </ul>
        <p className="field-hint" aria-live="polite">
          {chosen.length
            ? `${chosen.length} ${chosen.length === 1 ? "person signs" : "people sign"}. Everyone gets a notification; the signed PDF is ready once all of them have signed.`
            : "Choose at least one person. You can include yourself."}
        </p>
      </fieldset>
      <details className="group rounded-xl border border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4"><span><span className="block text-sm font-medium">Mark signature positions</span><span className="mt-0.5 block text-xs text-faint">Optional. Each signer can choose their own position.</span></span><ChevronDown aria-hidden className="size-4 shrink-0 text-faint transition-transform group-open:rotate-180" /></summary>
        <div className="border-t border-border p-3 sm:p-4">{(blank || file) ? <SignatureBoxPicker file={blank ? null : file} blank={blank} signers={chosenPeople} /> : <p className="text-sm text-muted">Choose a PDF or blank page first to preview signature positions.</p>}</div>
      </details>
      </section>

      <section className="card space-y-5 p-5 sm:p-6">
      <SectionHeading step="03" title="Add the finishing touches" description="Include a message or a deadline if you need one." />
      <Field label="Message (optional)" htmlFor="note">
        <textarea id="note" name="note" maxLength={1000} className="input" placeholder="Anything they should know before signing…" defaultValue={f?.note} />
      </Field>
      <div className="space-y-3 rounded-xl bg-surface-2/60 px-4 py-3">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="schedule"
            checked={schedule}
            onChange={(e) => setSchedule(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-(--primary)"
          />
          <span>
            <span className="flex items-center gap-1.5 font-medium">
              <CalendarClock className="size-4 shrink-0 text-faint" /> Set a signing deadline
            </span>
            <span className="block text-xs text-faint">
              Add the deadline and reminders to each signer&apos;s schedule.
            </span>
          </span>
        </label>
        {schedule && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:pl-7">
            <Field label="Sign by (date)" htmlFor="dueDate">
              <input id="dueDate" name="dueDate" type="date" required min={today} className="input" defaultValue={f?.dueDate} />
            </Field>
            <Field label="Time" htmlFor="dueTime">
              <input id="dueTime" name="dueTime" type="time" required className="input" defaultValue={f?.dueTime || "17:00"} />
            </Field>
          </div>
        )}
      </div>
      </section>

      <p className="flex items-start gap-2 text-xs text-muted">
        <MapPin className="mt-px size-3.5 shrink-0 text-faint" />
        Signers must share their location to sign. Their browser asks for it, and the place is recorded on the certificate page.
      </p>

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
      <Link href="/documents" className="btn-ghost">Cancel</Link>
      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Sending…" disabled={!chosen.length}>
        {chosen.length > 1 ? `Send to ${chosen.length} people for signature` : "Send for signature"}
      </SubmitButton>
      </div>
    </form>
  );
}

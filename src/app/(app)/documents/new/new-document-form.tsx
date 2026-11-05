"use client";

import { CalendarClock, FileUp, FileText, MapPin, Users } from "lucide-react";
import { useActionState, useState } from "react";
import { createDocument } from "@/app/actions/documents";
import { Field, FormMessage, SubmitButton } from "@/components/form";
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
  const toggle = (id: string, on: boolean) => setChosen((cur) => (on ? [...cur.filter((x) => x !== id), id] : cur.filter((x) => x !== id)));
  const allChosen = signers.length > 0 && chosen.length === signers.length;
  const chosenPeople = chosen.map((id) => signers.find((s) => s.id === id)!).filter(Boolean).map((s) => ({ id: s.id, name: s.id === meId ? `${s.name} (you)` : s.name }));

  return (
    <form action={action} className="card space-y-5 p-5 sm:p-6">
      <FormMessage error={sizeError || state?.error} />

      <label className="flex items-start gap-3 rounded-xl bg-surface-2/60 px-4 py-3 text-sm">
        <input
          type="checkbox"
          name="blank"
          checked={blank}
          onChange={(e) => setBlank(e.target.checked)}
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

      <SignatureBoxPicker file={blank ? null : file} blank={blank} signers={chosenPeople} />

      <Field label="Title" htmlFor="title">
        <input id="title" name="title" required maxLength={150} className="input" placeholder="e.g. Q4 budget approval" defaultValue={f?.title} />
      </Field>

      <fieldset className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <legend className="field-label flex items-center gap-1.5">
            <Users className="size-4 text-faint" /> Who should sign it?
          </legend>
          {signers.length > 1 && (
            <button type="button" onClick={() => setChosen(allChosen ? [] : signers.map((s) => s.id))} className="text-xs font-semibold text-primary hover:underline">
              {allChosen ? "Clear all" : "Select all"}
            </button>
          )}
        </div>
        <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
          {signers.map((s) => {
            const n = chosen.indexOf(s.id);
            return (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-2/60">
                  <input
                    type="checkbox"
                    name="signerIds"
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
        </ul>
        <p className="field-hint">
          {chosen.length
            ? `${chosen.length} ${chosen.length === 1 ? "person signs" : "people sign"}. Everyone gets a notification; the signed PDF is ready once all of them have signed.`
            : "Tick everyone who has to sign. Tick yourself to try it out."}
        </p>
      </fieldset>

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
              <CalendarClock className="size-4 text-faint" /> Add a signing deadline to everyone&apos;s schedule
            </span>
            <span className="block text-xs text-faint">
              Each signer gets a &quot;Sign: …&quot; event with reminders (pop-up and email) 1 day, 5 hours, 1 hour and 15 minutes before. It disappears once they sign.
            </span>
          </span>
        </label>
        {schedule && (
          <div className="grid grid-cols-2 gap-3 pl-7">
            <Field label="Sign by (date)" htmlFor="dueDate">
              <input id="dueDate" name="dueDate" type="date" required min={today} className="input" defaultValue={f?.dueDate} />
            </Field>
            <Field label="Time" htmlFor="dueTime">
              <input id="dueTime" name="dueTime" type="time" required className="input" defaultValue={f?.dueTime || "17:00"} />
            </Field>
          </div>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-muted">
        <MapPin className="mt-px size-3.5 shrink-0 text-faint" />
        Signers must share their location to sign. Their browser asks for it, and the place is recorded on the certificate page.
      </p>

      <Field label="Message (optional)" htmlFor="note">
        <textarea id="note" name="note" maxLength={1000} className="input" placeholder="Anything they should know before signing…" defaultValue={f?.note} />
      </Field>

      <SubmitButton pendingText="Sending…" disabled={!chosen.length}>
        {chosen.length > 1 ? `Send to ${chosen.length} people for signature` : "Send for signature"}
      </SubmitButton>
    </form>
  );
}

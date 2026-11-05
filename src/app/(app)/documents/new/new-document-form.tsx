"use client";

import { FileUp, FileText } from "lucide-react";
import { useActionState, useState } from "react";
import { createDocument } from "@/app/actions/documents";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { SignatureBoxPicker } from "./signature-box-picker";

type Signer = { id: string; name: string; email: string; role: string };

export function NewDocumentForm({ signers, meId, maxBytes }: { signers: Signer[]; meId: string; maxBytes: number }) {
  const maxLabel = `${Math.round((maxBytes / 1024 / 1024) * 10) / 10} MB`;
  const [sizeError, setSizeError] = useState("");
  const [state, action] = useActionState(createDocument, undefined);
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [blank, setBlank] = useState(false);
  const [self, setSelf] = useState(false);
  const f = state?.fields;

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

      <SignatureBoxPicker file={blank ? null : file} blank={blank} />

      <Field label="Title" htmlFor="title">
        <input id="title" name="title" required maxLength={150} className="input" placeholder="e.g. Q4 budget approval" defaultValue={f?.title} />
      </Field>

      <div className="space-y-3">
        <label className="flex items-start gap-3 rounded-xl bg-surface-2/60 px-4 py-3 text-sm">
          <input
            type="checkbox"
            checked={self}
            onChange={(e) => setSelf(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-(--primary)"
          />
          <span>
            <span className="block font-medium">I will sign it myself (to try it out)</span>
            <span className="block text-xs text-faint">The document comes to your own Documents list, ready to sign. No email is sent.</span>
          </span>
        </label>

        {self ? (
          <input type="hidden" name="signerId" value={meId} />
        ) : (
          <Field label="Who should sign it?" htmlFor="signerId">
            <select id="signerId" name="signerId" required className="input" defaultValue={f?.signerId && f.signerId !== meId ? f.signerId : ""}>
              <option value="" disabled className="bg-surface text-text">
                {signers.length ? "Choose a person…" : "No other accounts yet. Tick the box above to sign it yourself."}
              </option>
              {signers.map((s) => (
                <option key={s.id} value={s.id} className="bg-surface text-text">
                  {s.name} ({s.role}) · {s.email}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Field label="Message (optional)" htmlFor="note">
        <textarea id="note" name="note" maxLength={1000} className="input" placeholder="Anything they should know before signing…" defaultValue={f?.note} />
      </Field>

      <SubmitButton pendingText="Sending…">Send for signature</SubmitButton>
    </form>
  );
}

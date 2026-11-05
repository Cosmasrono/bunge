"use client";

import { BellRing, Check } from "lucide-react";
import { useActionState, useState } from "react";
import type { FormState } from "@/app/actions/auth";
import { Field, FormMessage, SubmitButton } from "@/components/form";

type Option = { value: string; label: string };

export type EventFormValues = {
  title: string;
  date: string;
  time: string;
  repeat: string;
  location: string;
  notes: string;
  leads: number[];
  emailReminders: boolean;
};

export function EventForm({
  action,
  initial,
  leadOptions,
  repeatOptions,
  quickDates,
  submitLabel,
  timezone,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial: EventFormValues;
  leadOptions: { minutes: number; label: string }[];
  repeatOptions: Option[];
  quickDates: { label: string; date: string }[];
  submitLabel: string;
  timezone: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const f = state?.fields;
  const [date, setDate] = useState(f?.date ?? initial.date);
  const [leads, setLeads] = useState<number[]>(f?.leads !== undefined ? f.leads.split(",").filter(Boolean).map(Number) : initial.leads);
  const [remind, setRemind] = useState(f ? f.emailReminders === "on" : initial.emailReminders);

  const toggle = (m: number) => setLeads((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage error={state?.error} />

      <div className="card space-y-5 p-5 sm:p-6">
        <Field label="What" htmlFor="title">
          <input
            id="title"
            name="title"
            required
            maxLength={150}
            className="input"
            placeholder="e.g. Board meeting"
            defaultValue={f?.title ?? initial.title}
            autoFocus={!initial.title}
          />
        </Field>

        <div>
          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <Field label="Date" htmlFor="date">
              <input id="date" name="date" type="date" required className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Time" htmlFor="time">
              <input id="time" name="time" type="time" required className="input" defaultValue={f?.time ?? initial.time} />
            </Field>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {quickDates.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setDate(q.date)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  date === q.date ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:bg-surface-2"
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
          <p className="field-hint">Times are in {timezone.replace(/_/g, " ")}.</p>
        </div>

        <Field label="Repeat" htmlFor="repeat">
          <select id="repeat" name="repeat" className="input" defaultValue={f?.repeat ?? initial.repeat}>
            {repeatOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Where (optional)" htmlFor="location">
          <input id="location" name="location" maxLength={200} className="input" placeholder="Office, Zoom link, address…" defaultValue={f?.location ?? initial.location} />
        </Field>

        <Field label="Notes (optional)" htmlFor="notes">
          <textarea id="notes" name="notes" maxLength={2000} className="input" placeholder="Agenda, things to bring…" defaultValue={f?.notes ?? initial.notes} />
        </Field>
      </div>

      <div className="card p-5 sm:p-6">
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <BellRing className="size-4.5" />
            </span>
            <span>
              <span className="block font-semibold">Email reminders</span>
              <span className="block text-sm text-muted">We&apos;ll email you before it starts.</span>
            </span>
          </span>
          <input type="checkbox" name="emailReminders" checked={remind} onChange={(e) => setRemind(e.target.checked)} className="peer sr-only" />
          <span
            aria-hidden
            className="relative h-6 w-11 shrink-0 rounded-full bg-border transition-colors peer-checked:bg-primary peer-focus-visible:ring-4 peer-focus-visible:ring-(--ring) after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
          />
        </label>

        {remind && (
          <fieldset className="mt-5">
            <legend className="mb-2.5 text-sm font-medium">Remind me</legend>
            <div className="flex flex-wrap gap-2">
              {leadOptions.map((o) => {
                const on = leads.includes(o.minutes);
                return (
                  <label
                    key={o.minutes}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors has-focus-visible:ring-4 has-focus-visible:ring-(--ring) ${
                      on ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:bg-surface-2"
                    }`}
                  >
                    <input type="checkbox" name="leads" value={o.minutes} checked={on} onChange={() => toggle(o.minutes)} className="sr-only" />
                    {on && <Check className="size-3.5" />}
                    {o.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      </div>

      <div className="flex justify-end">
        <SubmitButton className="btn-primary w-full sm:w-auto sm:px-8" pendingText="Saving…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}

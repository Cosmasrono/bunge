"use client";

import { useActionState } from "react";
import { changePassword, updateProfile } from "@/app/actions/auth";
import { Field, FormMessage, PasswordInput, SubmitButton } from "@/components/form";

export function ProfileForm({ name, timezone, timezones }: { name: string; timezone: string; timezones: string[] }) {
  const [state, action] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="mt-5 space-y-4">
      <FormMessage error={state?.error} ok={state?.ok} />
      <Field label="Name" htmlFor="name">
        <input id="name" name="name" required maxLength={100} defaultValue={name} className="input" autoComplete="name" />
      </Field>
      <Field label="Time zone" htmlFor="timezone" hint="Used for new events and for showing times.">
        <select id="timezone" name="timezone" defaultValue={timezone} className="input">
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </Field>
      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Saving…">
        Save profile
      </SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="mt-5 space-y-4" key={state?.ok}>
      <FormMessage error={state?.error} ok={state?.ok} />
      <Field label="Current password" htmlFor="current">
        <PasswordInput id="current" name="current" required autoComplete="current-password" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" htmlFor="password" hint="At least 10 characters.">
          <PasswordInput id="password" name="password" required minLength={10} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm">
          <PasswordInput id="confirm" name="confirm" required minLength={10} autoComplete="new-password" />
        </Field>
      </div>
      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Changing…">
        Change password
      </SubmitButton>
    </form>
  );
}

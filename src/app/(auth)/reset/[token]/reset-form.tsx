"use client";

import { useActionState } from "react";
import { resetPassword } from "@/app/actions/auth";
import { Field, FormMessage, PasswordInput, SubmitButton } from "@/components/form";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="mt-8 space-y-5">
      <input type="hidden" name="token" value={token} />
      <FormMessage error={state?.error} />
      <Field label="New password" htmlFor="password" hint="At least 10 characters.">
        <PasswordInput id="password" name="password" required minLength={10} autoComplete="new-password" autoFocus />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <PasswordInput id="confirm" name="confirm" required minLength={10} autoComplete="new-password" />
      </Field>
      <SubmitButton pendingText="Saving…">Save and sign in</SubmitButton>
    </form>
  );
}

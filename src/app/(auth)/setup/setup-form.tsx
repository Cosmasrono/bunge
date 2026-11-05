"use client";

import { useActionState } from "react";
import { setupAdmin } from "@/app/actions/auth";
import { Field, FormMessage, PasswordInput, SubmitButton } from "@/components/form";

export function SetupForm() {
  const [state, action] = useActionState(setupAdmin, undefined);
  return (
    <form action={action} className="mt-8 space-y-5">
      <FormMessage error={state?.error} />
      <Field label="Your name" htmlFor="name">
        <input id="name" name="name" required autoComplete="name" className="input" defaultValue={state?.fields?.name} />
      </Field>
      <Field label="Email" htmlFor="email">
        <input id="email" name="email" type="email" required autoComplete="email" className="input" defaultValue={state?.fields?.email} />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 10 characters. A short phrase is easy to remember and hard to guess.">
        <PasswordInput id="password" name="password" required minLength={10} autoComplete="new-password" />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <PasswordInput id="confirm" name="confirm" required minLength={10} autoComplete="new-password" />
      </Field>
      <SubmitButton pendingText="Sending code…">Continue</SubmitButton>
    </form>
  );
}

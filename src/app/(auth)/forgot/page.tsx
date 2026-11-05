"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { requestReset } from "@/app/actions/auth";
import { Field, FormMessage, SubmitButton } from "@/components/form";

export default function ForgotPage() {
  const [state, action] = useActionState(requestReset, undefined);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 text-[15px] text-muted">Enter your email and we&apos;ll send you a link to choose a new password.</p>
      <form action={action} className="mt-8 space-y-5">
        <FormMessage error={state?.error} ok={state?.ok} />
        {!state?.ok && (
          <>
            <Field label="Email" htmlFor="email">
              <input id="email" name="email" type="email" required autoComplete="email" autoFocus className="input" />
            </Field>
            <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
          </>
        )}
      </form>
      <Link href="/login" className="btn-ghost mt-6 w-fit px-2">
        <ArrowLeft className="size-4" /> Back to sign in
      </Link>
    </>
  );
}

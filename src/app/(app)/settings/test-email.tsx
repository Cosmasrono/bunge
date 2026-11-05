"use client";

import { Send } from "lucide-react";
import { useActionState } from "react";
import { sendTestEmail } from "@/app/actions/events";
import { FormMessage, SubmitButton } from "@/components/form";

export function TestEmailForm({ disabled, email }: { disabled: boolean; email: string }) {
  const [state, action] = useActionState(sendTestEmail, undefined);
  return (
    <form action={action} className="mt-5 space-y-3 border-t border-border pt-5">
      <FormMessage error={state?.error} ok={state?.ok} />
      <SubmitButton className="btn-secondary" pendingText="Sending…" disabled={disabled}>
        <Send className="size-4" /> Send a test email to {email}
      </SubmitButton>
    </form>
  );
}

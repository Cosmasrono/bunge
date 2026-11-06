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
      <p className="text-xs text-faint [overflow-wrap:anywhere]">Send a test to {email} to check delivery.</p>
      <SubmitButton className="btn-secondary w-full sm:w-auto" pendingText="Sending…" disabled={disabled}>
        <Send className="size-4" /> Send test email
      </SubmitButton>
    </form>
  );
}

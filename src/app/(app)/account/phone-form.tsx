"use client";

import { useActionState } from "react";
import { savePhoneSettings, sendTestPhoneMessage } from "@/app/actions/phone";
import { Field, FormMessage, SubmitButton } from "@/components/form";

export function PhoneForm({ phone }: { phone: string }) {
  const [saved, save] = useActionState(savePhoneSettings, undefined);
  const [tested, test] = useActionState(sendTestPhoneMessage, undefined);
  return (
    <div className="mt-6 border-t border-border pt-5">
      <form action={save} className="space-y-4">
        <FormMessage error={saved?.error} ok={saved?.ok} />
        <Field label="Phone number" htmlFor="phone" hint="Reminders and documents to sign are sent here by SMS too. Leave empty to turn SMS off.">
          <input id="phone" name="phone" type="tel" maxLength={30} autoComplete="tel" className="input" placeholder="0712 345 678" defaultValue={saved?.fields?.phone ?? phone} />
        </Field>
        <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Saving…">
          Save
        </SubmitButton>
      </form>
      {phone && (
        <form action={test} className="mt-3 space-y-3">
          <FormMessage error={tested?.error} ok={tested?.ok} />
          <SubmitButton className="btn-secondary btn-sm" pendingText="Sending…">
            Send a test SMS
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

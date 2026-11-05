"use client";

import { UserPlus } from "lucide-react";
import { useActionState } from "react";
import { inviteUser } from "@/app/actions/users";
import { Field, FormMessage, SubmitButton } from "@/components/form";

export function InviteForm() {
  const [state, action] = useActionState(inviteUser, undefined);
  const f = state?.fields;
  return (
    <form action={action} className="mt-5 space-y-5">
      <FormMessage error={state?.error} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor="name">
          <input id="name" name="name" required maxLength={100} autoComplete="off" className="input" defaultValue={f?.name} />
        </Field>
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" required maxLength={200} autoComplete="off" className="input" placeholder="name@company.com" defaultValue={f?.email} />
        </Field>
      </div>
      <Field label="Role" htmlFor="role" hint="Admins manage people and can add events to anyone's schedule. Directors see and manage their own schedule.">
        <select id="role" name="role" className="input" defaultValue={f?.role ?? "director"}>
          <option value="director" className="bg-surface text-text">
            Director
          </option>
          <option value="admin" className="bg-surface text-text">
            Admin
          </option>
        </select>
      </Field>
      <SubmitButton pendingText="Sending invitation…" className="btn-primary">
        <UserPlus className="size-4" /> Create account and email invitation
      </SubmitButton>
    </form>
  );
}

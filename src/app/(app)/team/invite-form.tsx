"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useState } from "react";
import { inviteUser } from "@/app/actions/users";
import { Field, FormMessage, SubmitButton } from "@/components/form";

/** `anyRole`: admins may create admins and directors; directors create staff only. */
export function InviteForm({ anyRole }: { anyRole: boolean }) {
  const [state, action] = useActionState(inviteUser, undefined);
  const f = state?.fields;
  const [role, setRole] = useState(f?.role ?? "staff");
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
      <Field
        label="Role"
        htmlFor="role"
        hint={
          role === "staff"
            ? "Staff manage their own schedule and sign documents sent to them. You can also let them schedule for others or send documents."
            : role === "director"
              ? "Directors manage people and permissions, schedule for others and send documents."
              : "Admins can do everything, including Settings."
        }
      >
        <select id="role" name="role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="staff" className="bg-surface text-text">
            Staff
          </option>
          {anyRole && (
            <>
              <option value="director" className="bg-surface text-text">
                Director
              </option>
              <option value="admin" className="bg-surface text-text">
                Admin
              </option>
            </>
          )}
        </select>
      </Field>
      {role === "staff" && (
        <fieldset className="space-y-2 rounded-xl bg-surface-2/60 px-4 py-3 text-sm">
          <legend className="sr-only">Permissions</legend>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="canSchedule" defaultChecked={f?.canSchedule === "on"} className="mt-0.5 size-4 shrink-0 accent-(--primary)" />
            <span>
              <span className="block font-medium">Can schedule events for others</span>
              <span className="block text-xs text-faint">Add, see and change events on anyone&apos;s schedule.</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="canSendDocuments" defaultChecked={f?.canSendDocuments === "on"} className="mt-0.5 size-4 shrink-0 accent-(--primary)" />
            <span>
              <span className="block font-medium">Can send documents for signing</span>
              <span className="block text-xs text-faint">Upload PDFs and choose who signs them.</span>
            </span>
          </label>
        </fieldset>
      )}
      <SubmitButton pendingText="Sending invitation…" className="btn-primary">
        <UserPlus className="size-4" /> Create account and email invitation
      </SubmitButton>
    </form>
  );
}

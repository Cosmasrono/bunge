"use client";

import { CalendarPlus, Check, FileSignature, Search, Send, Users } from "lucide-react";
import { useState } from "react";
import { changeRole, resendInvite, setPermission } from "@/app/actions/users";
import { SubmitButton } from "@/components/form";
import { ROLE_LABEL, type RoleName } from "@/lib/auth/permissions";

type Member = { id: string; name: string; email: string; role: RoleName; lastLoginAt: string | null; canSchedule: boolean | null; canSendDocuments: boolean | null };
const PERMISSIONS = [{ key: "canSchedule", label: "Schedule for others", icon: CalendarPlus }, { key: "canSendDocuments", label: "Send documents", icon: FileSignature }] as const;

export function TeamDirectory({ users, meId, isAdmin, timezone }: { users: Member[]; meId: string; isAdmin: boolean; timezone: string }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const shown = users.filter((person) => (!role || person.role === role) && `${person.name} ${person.email}`.toLowerCase().includes(query.trim().toLowerCase()));
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, day: "numeric", month: "short" });

  return (
    <section className="min-w-0">
      <h2 className="mb-4 flex items-center gap-2 font-semibold">Your team<span className="chip">{users.length}</span></h2>
      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
        <div className="relative"><Search aria-hidden className="absolute top-4 left-3.5 size-4 text-faint" /><input type="search" className="input pl-10" aria-label="Search team" placeholder="Search name or email" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <select aria-label="Filter by role" className="input" value={role} onChange={(event) => setRole(event.target.value)}><option value="">All roles</option>{Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </div>
      <p aria-live="polite" className="mb-3 text-xs text-faint">Showing {shown.length} of {users.length} {users.length === 1 ? "person" : "people"}</p>
      <ul className="space-y-4">
        {shown.map((person) => <li key={person.id} className="card p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{person.name.trim()[0]?.toUpperCase() || "?"}</span>
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{person.name}{person.id === meId && <span className="ml-1.5 text-xs font-normal text-faint">(you)</span>}</p><p className="truncate text-sm text-muted">{person.email}</p></div>
            <span className="chip shrink-0">{ROLE_LABEL[person.role]}</span>
          </div>
          <p className="mt-3 text-xs text-faint">{person.lastLoginAt ? `Last sign-in ${fmt.format(new Date(person.lastLoginAt))}` : "Invitation sent · hasn't signed in yet"}</p>

          {person.role === "staff" ? <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {PERMISSIONS.map(({ key, label, icon: Icon }) => {
              const enabled = person[key] === true;
              return <form key={key} action={setPermission.bind(null, person.id, key, !enabled)}>
                <button aria-label={`${label} for ${person.name}`} aria-pressed={enabled} className={`flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors ${enabled ? "border-primary/25 bg-primary-soft text-primary" : "border-border text-muted hover:bg-surface-2"}`}>
                  <Icon aria-hidden className="size-3.5 shrink-0" /><span className="flex-1 text-left">{label}</span><span className="flex items-center gap-1">{enabled && <Check aria-hidden className="size-3" />}{enabled ? "On" : "Off"}</span>
                </button>
              </form>;
            })}
          </div> : <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">Can manage the team, schedule for others, and send documents.</p>}

          {person.id !== meId && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            {isAdmin && <form action={changeRole.bind(null, person.id)} className="flex min-w-0 flex-wrap items-center gap-2">
              <select name="role" defaultValue={person.role} aria-label={`Role for ${person.name}`} className="input h-11 w-auto text-sm">{Object.entries(ROLE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <SubmitButton className="btn-secondary" pendingText="Saving…">Save role</SubmitButton>
            </form>}
            <form action={resendInvite.bind(null, person.id)}><SubmitButton className="btn-ghost px-2" pendingText="Sending…"><Send aria-hidden className="size-3.5" />{person.lastLoginAt ? "Send reset link" : "Resend invite"}</SubmitButton></form>
          </div>}
        </li>)}
      </ul>
      {!shown.length && <div className="card flex flex-col items-center px-5 py-12 text-center"><Users aria-hidden className="size-7 text-faint" /><h3 className="mt-4 font-semibold">No matching teammates</h3><p className="mt-1 text-sm text-muted">Try another name, email, or role.</p><button type="button" className="btn-secondary mt-5" onClick={() => { setQuery(""); setRole(""); }}>Clear filters</button></div>}
    </section>
  );
}

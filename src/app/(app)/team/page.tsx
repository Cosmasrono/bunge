import { CalendarPlus, Check, FileSignature, Mail, Send } from "lucide-react";
import type { Metadata } from "next";
import { changeRole, resendInvite, setPermission } from "@/app/actions/users";
import { Flash } from "@/components/client-bits";
import { getDb } from "@/db";
import { INVITE_HOURS } from "@/lib/auth/invite";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { requireManager } from "@/lib/auth/session";
import { mailConfigured } from "@/lib/mail";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Team" };

const ERRORS: Record<string, string> = {
  mail: "Email isn't set up yet, so nothing was sent.",
  send: "We couldn't send that email. Please try again.",
  limit: "Too many emails sent. Please wait a while.",
  lastadmin: "That's the only admin, so their role can't be changed. Make someone else an admin first.",
};

const PERMS = [
  { key: "canSchedule", label: "Schedule for others", icon: CalendarPlus },
  { key: "canSendDocuments", label: "Send documents", icon: FileSignature },
] as const;

export default async function TeamPage({ searchParams }: PageProps<"/team">) {
  const me = await requireManager();
  const isAdmin = me.role === "admin";
  const users = await getDb().user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, lastLoginAt: true, canSchedule: true, canSendDocuments: true },
  });
  const sp = await searchParams;
  const flash =
    typeof sp.invited === "string"
      ? `Invitation sent to ${sp.invited}.`
      : typeof sp.resent === "string"
        ? `New link sent to ${sp.resent}.`
        : typeof sp.role === "string"
          ? `Role changed to ${sp.role}.`
          : sp.changed === "1"
            ? "Permission updated."
            : null;
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : null;
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: me.timezone, day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {flash && <Flash message={flash} />}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-sm text-muted">
          Create accounts and choose who may schedule for others and send documents. Admins and directors can always do both.
        </p>
      </div>

      {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      <section className="card p-5 sm:p-6">
        <h2 className="font-semibold">Invite someone</h2>
        <p className="mt-1 text-sm text-muted">
          They get an email with a one-time link (valid for {INVITE_HOURS} hours) to choose a password and sign in. No password is ever emailed.
          {!isAdmin && " Directors can create staff accounts; ask an admin for new admins or directors."}
        </p>
        {!mailConfigured() && (
          <p className="mt-4 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">Email isn&apos;t set up yet, so invitations can&apos;t be sent. See Settings.</p>
        )}
        <InviteForm anyRole={isAdmin} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">
          People <span className="ml-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs">{users.length}</span>
        </h2>
        <ul className="card divide-y divide-border overflow-hidden">
          {users.map((u) => {
            const staff = u.role === "staff";
            return (
              <li key={u.id} className="space-y-3 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                    {u.name.trim().slice(0, 1).toUpperCase() || "?"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {u.name}
                      {u.id === me.id && <span className="ml-1.5 text-xs font-normal text-faint">(you)</span>}
                    </span>
                    <span className="block truncate text-sm text-muted">{u.email}</span>
                  </span>
                  {isAdmin && u.id !== me.id ? (
                    <form action={changeRole.bind(null, u.id)} className="flex items-center gap-1.5">
                      <select name="role" defaultValue={u.role} aria-label={`Role for ${u.name}`} className="input h-8 w-auto py-0 pr-8 text-xs">
                        {(["staff", "director", "admin"] as const).map((r) => (
                          <option key={r} value={r} className="bg-surface text-text">
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <button className="btn-ghost btn-sm">Change</button>
                    </form>
                  ) : (
                    <span className="chip">{ROLE_LABEL[u.role]}</span>
                  )}
                  {u.lastLoginAt ? (
                    <span className="chip bg-success-soft text-success">Active · {fmt.format(u.lastLoginAt)}</span>
                  ) : (
                    <span className="chip bg-warning-soft text-warning">
                      <Mail className="size-3" /> Invited · not signed in yet
                    </span>
                  )}
                  {u.id !== me.id && (
                    <form action={resendInvite.bind(null, u.id)}>
                      <button className="btn-secondary btn-sm" title={u.lastLoginAt ? "Send a link to choose a new password" : "Send the invitation again"}>
                        <Send className="size-3.5" /> {u.lastLoginAt ? "Send reset link" : "Resend invite"}
                      </button>
                    </form>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pl-14 text-xs">
                  {staff ? (
                    PERMS.map(({ key, label, icon: Icon }) => {
                      const on = u[key] === true;
                      return (
                        <form key={key} action={setPermission.bind(null, u.id, key, !on)}>
                          <button
                            aria-pressed={on}
                            title={on ? `Click to stop ${u.name.split(" ")[0]} doing this` : `Click to allow ${u.name.split(" ")[0]} to do this`}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium transition-colors ${
                              on ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:bg-surface-2"
                            }`}
                          >
                            {on ? <Check className="size-3.5" /> : <Icon className="size-3.5" />} {label}: {on ? "allowed" : "not allowed"}
                          </button>
                        </form>
                      );
                    })
                  ) : (
                    <span className="text-faint">Can schedule for others and send documents ({ROLE_LABEL[u.role].toLowerCase()}).</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

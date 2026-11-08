import { UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Flash } from "@/components/client-bits";
import { getDb } from "@/db";
import { INVITE_HOURS } from "@/lib/auth/invite";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { requireManager } from "@/lib/auth/session";
import { mailConfigured } from "@/lib/mail";
import { InviteForm } from "./invite-form";
import { TeamDirectory } from "./team-directory";

export const metadata: Metadata = { title: "Team" };

const ERRORS: Record<string, string> = {
  mail: "Email isn't set up yet, so nothing was sent.",
  send: "We couldn't send that email. Please try again.",
  limit: "Too many emails sent. Please wait a while.",
  lastadmin: "That's the only admin, so their role can't be changed. Make someone else an admin first.",
};

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

  return (
    <div>
      {flash && <Flash message={flash} />}
      <PageHeader title="Your team" description="Manage accounts and permissions." actions={<Link href="#invite-person" className="btn-primary"><UserPlus className="size-4" />Invite teammate</Link>} />
      {error && <p role="alert" className="mb-6 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_340px]">
        <TeamDirectory users={users.map((person) => ({ ...person, lastLoginAt: person.lastLoginAt?.toISOString() ?? null }))} meId={me.id} isAdmin={isAdmin} timezone={me.timezone} />
        <section id="invite-person" className="card p-5 sm:p-6 xl:sticky xl:top-28">
          <SectionHeading icon={UserPlus} title="Invite a teammate" description="Give someone access to your workspace." />
          <p className="text-xs leading-relaxed text-muted">We&apos;ll email a link to set their password. The invitation expires in {INVITE_HOURS} hours.{!isAdmin && " Directors can invite staff. An admin can add other roles."}</p>
          {!mailConfigured() && <p className="mt-4 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">Email is not connected yet. Set it up in Settings before sending invitations.</p>}
          <InviteForm anyRole={isAdmin} />
        </section>
      </div>
    </div>
  );
}

import { CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Clock, Mail, MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { APP_URL, mailSummary } from "@/lib/mail";
import { lastReminderRun } from "@/lib/reminders";
import { TestEmailForm } from "./test-email";
import { PageHeader, SectionHeading, SectionNav } from "@/components/page-header";

export const metadata: Metadata = { title: "Settings" };

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`chip ${ok ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
      {ok ? <CheckCircle2 className="size-3.5" /> : <CircleAlert className="size-3.5" />}
      {children}
    </span>
  );
}

export default async function SettingsPage() {
  const user = await requireAdmin();
  const mail = mailSummary();
  const run = await lastReminderRun();
  const now = new Date();
  const lastRunAgoMin = run ? Math.round((now.getTime() - new Date(run.at).getTime()) / 60000) : null;
  const checkerOk = lastRunAgoMin !== null && lastRunAgoMin <= 5;
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: user.timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit" });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Settings" description="Keep your workspace's email and reminders running smoothly." />
      <div className="grid items-start gap-6 lg:grid-cols-[160px_minmax(0,1fr)] lg:gap-8">
      <SectionNav items={[{ id: "email", label: "Email", icon: Mail }, { id: "reminders", label: "Reminders", icon: Clock }]} />
      <div className="min-w-0 space-y-6">

      <Link href="/settings/messages" className="card flex items-center gap-3 p-4 transition-colors hover:bg-surface-2 sm:p-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><MessageSquare aria-hidden className="size-4.5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Message log</span>
          <span className="block text-sm text-muted">See whether each notification&apos;s email and SMS went out.</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-faint" />
      </Link>

      <section id="email" className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading icon={Mail} title="Email delivery" description="For reminders, invitations, and document requests." />
          <Status ok={mail.configured}>{mail.configured ? "Connected" : "Not set up"}</Status>
        </div>
        {mail.configured ? (
          <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 rounded-xl bg-surface-2 p-4 text-sm">
            <dt className="text-muted">Server</dt>
            <dd className="font-mono text-[13px] break-all">{mail.host}</dd>
            <dt className="text-muted">Sends from</dt>
            <dd className="font-mono text-[13px] break-all">{mail.from}</dd>
          </dl>
        ) : (
          <div className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning"><p>Connect an email account to send reminders and invitations.</p></div>
        )}
        <details className="group mt-5 rounded-xl border border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">Email setup instructions<ChevronDown aria-hidden className="size-4 shrink-0 text-faint transition-transform group-open:rotate-180" /></summary>
          <div className="border-t border-border p-4 text-sm leading-relaxed text-muted">
            <p>Add these values to your server settings, then restart the app:</p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-surface-2 p-4 font-mono text-[12.5px] leading-6 text-text">
{`SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM="PRS <you@gmail.com>"`}
            </pre>
            <p className="mt-3">
              On your PC these go in <code className="font-mono">.env</code>; online, in Vercel → Project → Settings → Environment
              Variables. Passwords are never shown on this page.
            </p>
          </div>
        </details>
        <TestEmailForm disabled={!mail.configured} email={user.email} />
      </section>

      <section id="reminders" className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading icon={Clock} title="Scheduled reminders" description="Checks your schedule and sends reminders when they're due." />
          <Status ok={checkerOk}>{checkerOk ? "Running" : run ? "Needs attention" : "Not started"}</Status>
        </div>
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
          {run ? (
            <>
              Last check: <b className="text-text">{fmt.format(new Date(run.at))}</b> ({lastRunAgoMin} min ago) · sent {run.sent}
              {run.failed ? `, failed ${run.failed}` : ""}
            </>
          ) : (
            "No checks yet."
          )}
        </p>
        {run?.errors?.length ? (
          <ul className="mt-3 space-y-1 rounded-xl bg-danger-soft p-3 text-sm text-danger">
            {run.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        ) : null}
        <details className="group mt-5 rounded-xl border border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">Reminder setup instructions<ChevronDown aria-hidden className="size-4 shrink-0 text-faint transition-transform group-open:rotate-180" /></summary>
        <div className="border-t border-border p-4">
        <p className="text-sm leading-relaxed text-muted">
          Online, a free scheduler (cron-job.org) should call this address every minute with the header{" "}
          <code className="font-mono text-[12.5px]">Authorization: Bearer &lt;CRON_SECRET&gt;</code>:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-2 p-3 font-mono text-[12.5px]">{APP_URL}/api/cron/reminders</pre>
        </div>
        </details>
      </section>
      </div>
      </div>
    </div>
  );
}

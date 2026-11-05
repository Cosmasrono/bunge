import { CheckCircle2, CircleAlert, Clock, Mail } from "lucide-react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { APP_URL, mailSummary } from "@/lib/mail";
import { lastReminderRun } from "@/lib/reminders";
import { TestEmailForm } from "./test-email";

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
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Mail className="size-4.5" />
            </span>
            <h2 className="font-semibold">Email</h2>
          </div>
          <Status ok={mail.configured}>{mail.configured ? "Connected" : "Not set up"}</Status>
        </div>
        {mail.configured ? (
          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted">Server</dt>
            <dd className="font-mono text-[13px]">{mail.host}</dd>
            <dt className="text-muted">Sends from</dt>
            <dd className="font-mono text-[13px] break-all">{mail.from}</dd>
          </dl>
        ) : (
          <div className="mt-4 text-sm leading-relaxed text-muted">
            <p>Add your email credentials to the server settings, then restart:</p>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-surface-2 p-4 font-mono text-[12.5px] leading-6 text-text">
{`SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM="Nation Desk <you@gmail.com>"`}
            </pre>
            <p className="mt-3">
              On your PC these go in <code className="font-mono">.env</code>; online, in Vercel → Project → Settings → Environment
              Variables. Passwords are never shown on this page.
            </p>
          </div>
        )}
        <TestEmailForm disabled={!mail.configured} email={user.email} />
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Clock className="size-4.5" />
            </span>
            <h2 className="font-semibold">Reminder checker</h2>
          </div>
          <Status ok={checkerOk}>{checkerOk ? "Running" : run ? "Not running recently" : "Never ran"}</Status>
        </div>
        <p className="mt-4 text-sm text-muted">
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
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Online, a free scheduler (cron-job.org) should call this address every minute with the header{" "}
          <code className="font-mono text-[12.5px]">Authorization: Bearer &lt;CRON_SECRET&gt;</code>:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-surface-2 p-3 font-mono text-[12.5px]">{APP_URL}/api/cron/reminders</pre>
      </section>
    </div>
  );
}

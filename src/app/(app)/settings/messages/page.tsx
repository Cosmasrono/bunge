import { ArrowLeft, CheckCircle2, CircleAlert, Mail, MessageSquare, MinusCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/db";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Message log" };

const LABEL: Record<string, string> = { sent: "Sent", failed: "Failed", off: "Not set up", no_number: "No phone number", none: "Not sent" };

const sevenDaysAgo = () => new Date(Date.now() - 7 * 86_400_000);

/** Admins: for each notification, whether its email and its SMS went out. */
export default async function MessageLogPage({ searchParams }: PageProps<"/settings/messages">) {
  const admin = await requireAdmin();
  const { show } = await searchParams;
  const onlyProblems = show === "failed";
  const db = getDb();
  const since = sevenDaysAgo();
  const [rows, total, emailSent, smsSent, failed] = await Promise.all([
    db.messageLog.findMany({
      where: onlyProblems ? { OR: [{ emailStatus: "failed" }, { smsStatus: "failed" }] } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { name: true } } },
    }),
    db.messageLog.count({ where: { createdAt: { gt: since } } }),
    db.messageLog.count({ where: { createdAt: { gt: since }, emailStatus: "sent" } }),
    db.messageLog.count({ where: { createdAt: { gt: since }, smsStatus: "sent" } }),
    db.messageLog.count({ where: { createdAt: { gt: since }, OR: [{ emailStatus: "failed" }, { smsStatus: "failed" }] } }),
  ]);
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: admin.timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/settings" className="btn-ghost -ml-2 mb-3 px-2">
        <ArrowLeft className="size-4" /> Settings
      </Link>
      <PageHeader eyebrow="Workspace preferences" title="Message log" description="Whether each notification's email and SMS went out." />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Notifications" value={total} />
        <Stat label="Emails sent" value={emailSent} />
        <Stat label="SMS sent" value={smsSent} />
        <Stat label="With a failure" value={failed} warn={failed > 0} />
      </dl>
      <p className="mt-2 text-xs text-faint">Last 7 days. &quot;Sent&quot; means the email server or MobileSasa accepted the message; it can&apos;t confirm it reached the person.</p>

      <div className="mt-6 flex gap-2 text-sm" role="group" aria-label="Filter">
        <Link href="/settings/messages" aria-current={onlyProblems ? undefined : "page"} className={onlyProblems ? "btn-ghost btn-sm" : "btn-secondary btn-sm"}>
          All
        </Link>
        <Link href="/settings/messages?show=failed" aria-current={onlyProblems ? "page" : undefined} className={onlyProblems ? "btn-secondary btn-sm" : "btn-ghost btn-sm"}>
          Failures only
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="card mt-4 p-6 text-center text-sm text-muted">{onlyProblems ? "No failures." : "Nothing has been sent yet."}</p>
      ) : (
        <ul className="card mt-4 divide-y divide-border overflow-hidden">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <p className="min-w-0 font-medium break-words">{r.title}</p>
                <p className="shrink-0 text-xs text-faint">{fmt.format(r.createdAt)}</p>
              </div>
              <p className="text-sm text-muted">To {r.user.name}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Channel icon={Mail} name="Email" status={r.emailStatus} />
                <Channel icon={MessageSquare} name="SMS" status={r.smsStatus} />
              </div>
              {r.emailError && <p className="mt-2 text-xs break-words text-danger">Email: {r.emailError}</p>}
              {r.smsError && <p className="mt-2 text-xs break-words text-danger">SMS: {r.smsError}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="card p-4">
      <dt className="text-xs font-medium text-faint">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${warn ? "text-danger" : ""}`}>{value}</dd>
    </div>
  );
}

function Channel({ icon: Icon, name, status }: { icon: typeof Mail; name: string; status: string }) {
  const style = status === "sent" ? "bg-success-soft text-success" : status === "failed" ? "bg-danger-soft text-danger" : "";
  const Mark = status === "sent" ? CheckCircle2 : status === "failed" ? CircleAlert : MinusCircle;
  return (
    <span className={`chip ${style}`}>
      <Icon aria-hidden className="size-3" /> {name}: {LABEL[status] ?? status} <Mark aria-hidden className="size-3" />
    </span>
  );
}

import { BellRing, KeyRound, MonitorSmartphone, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { signOutOtherDevices } from "@/app/actions/auth";
import { Flash } from "@/components/client-bits";
import { getDb } from "@/db";
import { pushConfigured, vapidPublicKey } from "@/lib/push";
import { PushSettings } from "./push-settings";
import { requireUser } from "@/lib/auth/session";
import { PasswordForm, ProfileForm } from "./forms";
import { PageHeader, SectionHeading, SectionNav } from "@/components/page-header";

export const metadata: Metadata = { title: "Account" };

function deviceName(ua: string | null) {
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${browser} on ${os}`;
}

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await requireUser();
  const sessions = (
    await getDb().session.findMany({
      where: { userId: user.id },
      select: { id: true, userAgent: true, lastSeenAt: true, ip: true },
      orderBy: { lastSeenAt: "desc" },
    })
  ).map((s) => ({ id: s.id, ua: s.userAgent, lastSeen: s.lastSeenAt, ip: s.ip }));
  const timezones = Intl.supportedValuesOf("timeZone");
  const { signedOut } = await searchParams;
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: user.timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <div className="mx-auto max-w-5xl">
      {signedOut && <Flash message="Signed out on your other devices." />}
      <PageHeader eyebrow="Make yourself at home" title="Your account" description="Manage your profile, notifications, and account security." />
      <div className="grid items-start gap-6 lg:grid-cols-[160px_minmax(0,1fr)] lg:gap-8">
      <SectionNav items={[{ id: "profile", label: "Profile", icon: UserRound }, { id: "notifications", label: "Notifications", icon: BellRing }, { id: "password", label: "Password", icon: KeyRound }, { id: "devices", label: "Devices", icon: MonitorSmartphone }]} />
      <div className="min-w-0 space-y-6">

      <section id="profile" className="card p-5 sm:p-6">
        <SectionHeading icon={UserRound} title="Profile" description="The details you use across your workspace." />
        <div className="rounded-xl bg-surface-2 px-4 py-3"><p className="text-xs font-medium text-faint">Your email</p><p className="mt-0.5 text-sm font-medium break-all">{user.email}</p></div>
        <ProfileForm name={user.name} timezone={user.timezone} timezones={timezones} />
      </section>

      <section id="notifications" className="card p-5 sm:p-6">
        <SectionHeading icon={BellRing} title="Notifications" description="Get reminders on this device, even when your workspace is closed. Enable them on each device you use." />
        {pushConfigured() ? (
          <PushSettings publicKey={vapidPublicKey()} />
        ) : (
          <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">Device notifications aren&apos;t available yet. Your administrator needs to finish setting them up.</p>
        )}
      </section>

      <section id="password" className="card p-5 sm:p-6">
        <SectionHeading icon={KeyRound} title="Password" description="Choose a password you haven't used elsewhere. Changing it signs out your other devices." />
        <PasswordForm />
      </section>

      <section id="devices" className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionHeading icon={MonitorSmartphone} title="Your devices" description="Review where you're signed in. Sign out other devices if you don't recognise one." />
          </div>
          {sessions.length > 1 && (
            <form action={signOutOtherDevices}>
              <button className="btn-secondary btn-sm">Sign out other devices</button>
            </form>
          )}
        </div>
        <ul className="mt-4 divide-y divide-border">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2"><MonitorSmartphone aria-hidden className="size-5 text-faint" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {deviceName(s.ua)}
                  {s.id === user.sessionId && <span className="chip ml-2 bg-success-soft text-success">This device</span>}
                </p>
                <p className="mt-1 text-xs text-faint [overflow-wrap:anywhere]">
                  Last active {fmt.format(s.lastSeen)} · IP {s.ip}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      </div>
      </div>
    </div>
  );
}

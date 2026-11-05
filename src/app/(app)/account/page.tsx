import { MonitorSmartphone } from "lucide-react";
import type { Metadata } from "next";
import { signOutOtherDevices } from "@/app/actions/auth";
import { Flash } from "@/components/client-bits";
import { getDb } from "@/db";
import { pushConfigured, vapidPublicKey } from "@/lib/push";
import { PushSettings } from "./push-settings";
import { requireUser } from "@/lib/auth/session";
import { PasswordForm, ProfileForm } from "./forms";

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
    <div className="mx-auto max-w-2xl space-y-8">
      {signedOut && <Flash message="Signed out on your other devices." />}
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>

      <section className="card p-5 sm:p-6">
        <h2 className="font-semibold">Profile</h2>
        <p className="mt-1 text-sm text-muted">Reminders go to {user.email}.</p>
        <ProfileForm name={user.name} timezone={user.timezone} timezones={timezones} />
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="font-semibold">Notifications</h2>
        <p className="mt-1 text-sm text-muted">Get your reminders as a pop-up on this phone or computer, even when the app isn&apos;t open. Turn it on for each device you use.</p>
        {pushConfigured() ? (
          <PushSettings publicKey={vapidPublicKey()} />
        ) : (
          <p className="mt-4 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">Notifications aren&apos;t set up on the server yet. An admin needs to add the VAPID keys (see the README).</p>
        )}
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="font-semibold">Password</h2>
        <p className="mt-1 text-sm text-muted">Changing it signs you out on your other devices.</p>
        <PasswordForm />
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Where you&apos;re signed in</h2>
            <p className="mt-1 text-sm text-muted">If you don&apos;t recognise a device, sign it out and change your password.</p>
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
              <MonitorSmartphone className="size-5 text-faint" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {deviceName(s.ua)}
                  {s.id === user.sessionId && <span className="chip ml-2 bg-success-soft text-success">This device</span>}
                </p>
                <p className="text-xs text-faint">
                  Last active {fmt.format(s.lastSeen)} · IP {s.ip}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

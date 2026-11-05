"use client";

import { Bell, BellOff, Share, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/actions/push";
import { FormMessage } from "@/components/form";

type Status = "checking" | "unsupported" | "needs-install" | "blocked" | "off" | "on";

const toKey = (base64: string) => {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Works out what this browser can do and whether notifications are already on here. */
async function detect(): Promise<Status> {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  // iPhones only allow notifications for sites added to the Home Screen (iOS 16.4+).
  if (ios && !standalone) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** Turn phone / computer notifications on or off for this device. */
export function PushSettings({ publicKey }: { publicKey: string }) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});

  const refresh = async () => setStatus(await detect());

  useEffect(() => {
    let alive = true;
    void detect().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  async function enable() {
    setBusy(true);
    setMsg({});
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMsg({ error: "Notifications were not allowed. You can allow them in your browser's site settings." });
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
      const r = await savePushSubscription(sub.toJSON());
      if (r?.error) {
        await sub.unsubscribe();
        setMsg({ error: r.error });
      } else setMsg({ ok: r?.ok });
    } catch (err) {
      setMsg({ error: `Couldn't turn notifications on: ${(err as Error).message}` });
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function disable() {
    setBusy(true);
    setMsg({});
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setMsg({ ok: "Notifications are off for this device." });
    } catch (err) {
      setMsg({ error: (err as Error).message });
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  async function test() {
    setBusy(true);
    setMsg({});
    const r = await sendTestPush();
    setMsg({ error: r?.error, ok: r?.ok });
    setBusy(false);
  }

  if (status === "checking") return <p className="mt-4 text-sm text-faint">Checking this device…</p>;

  return (
    <div className="mt-4 space-y-4">
      <FormMessage error={msg.error} ok={msg.ok} />

      {status === "needs-install" && (
        <div className="flex items-start gap-3 rounded-xl bg-primary-soft px-4 py-3.5 text-sm text-primary">
          <Smartphone className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">On iPhone, add this site to your Home Screen first</p>
            <p>
              Tap <Share className="inline size-3.5 -translate-y-px" /> Share → <b>Add to Home Screen</b>, then open Nation Desk from the new icon and turn notifications on here. This needs iOS 16.4 or newer.
            </p>
          </div>
        </div>
      )}
      {status === "unsupported" && <p className="text-sm text-muted">This browser can&apos;t show notifications from websites. Try Chrome, Edge, Firefox or Safari (on iPhone, from the Home Screen).</p>}
      {status === "blocked" && <p className="text-sm text-muted">Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then come back and turn them on.</p>}

      {(status === "off" || status === "on") && (
        <div className="flex flex-wrap items-center gap-2">
          {status === "off" ? (
            <button type="button" onClick={enable} disabled={busy} className="btn-primary">
              <Bell className="size-4" /> Turn on notifications
            </button>
          ) : (
            <>
              <span className="chip bg-success-soft text-success">
                <Bell className="size-3" /> On for this device
              </span>
              <button type="button" onClick={test} disabled={busy} className="btn-secondary btn-sm">
                Send a test
              </button>
              <button type="button" onClick={disable} disabled={busy} className="btn-ghost btn-sm">
                <BellOff className="size-3.5" /> Turn off
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

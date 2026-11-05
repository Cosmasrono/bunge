"use client";

import { Bell, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { markNoticesRead } from "@/app/actions/notices";

type Notice = { id: string; title: string; body: string; url: string };

const POLL_SECONDS = 20;

/**
 * Pop-ups inside the app: checks for new notifications every 20 seconds while the app is open (and when you
 * come back to the tab), shows each one in the corner, and marks it read when opened or dismissed.
 * Phone/computer pop-ups when the app is closed come from Web Push (see public/sw.js).
 */
export function NoticePopups() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const seen = useRef(new Set<string>());
  const router = useRouter();

  const check = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const res = await fetch("/api/notices", { cache: "no-store" });
      if (!res.ok) return;
      const { notices: fresh } = (await res.json()) as { notices: Notice[] };
      const added = fresh.filter((n) => !seen.current.has(n.id));
      if (!added.length) return;
      added.forEach((n) => seen.current.add(n.id));
      setNotices((cur) => [...cur, ...added].slice(-4));
      router.refresh(); // lists like "Waiting for your signature" pick up the change
    } catch {
      /* offline: try again next time */
    }
  }, [router]);

  useEffect(() => {
    const first = setTimeout(check, 1500);
    const id = setInterval(check, POLL_SECONDS * 1000);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  const close = (ids: string[]) => {
    setNotices((cur) => cur.filter((n) => !ids.includes(n.id)));
    void markNoticesRead(ids);
  };

  if (!notices.length) return null;
  return (
    <div aria-live="polite" className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-sm flex-col gap-2 lg:inset-x-auto lg:right-6 lg:bottom-6">
      {notices.length > 1 && (
        <button type="button" onClick={() => close(notices.map((n) => n.id))} className="self-end text-xs font-semibold text-muted hover:text-text">
          Dismiss all
        </button>
      )}
      {notices.map((n) => (
        <div key={n.id} role="status" className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm shadow-pop">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Bell className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold break-words">{n.title}</p>
            {n.body && <p className="mt-0.5 text-muted break-words">{n.body}</p>}
            {n.url.startsWith("/") && (
              <Link href={n.url} onClick={() => close([n.id])} className="mt-1.5 inline-block font-semibold text-primary hover:underline">
                Open
              </Link>
            )}
          </div>
          <button type="button" onClick={() => close([n.id])} className="text-faint hover:text-text" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

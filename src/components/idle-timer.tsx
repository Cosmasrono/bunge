"use client";

import { Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { keepAlive, signOutIdle } from "@/app/actions/session";

const KEY = "nd_last_activity"; // shared by all open tabs, so activity in one keeps the others signed in too
const WARN_MS = 60_000;
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll", "mousemove"] as const;

const readShared = () => {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
};

/**
 * Signs the person out after `idleMs` without activity (clicks, typing, scrolling, moving the mouse), with a
 * one-minute warning. While they are active it tells the server now and then, which keeps the session going.
 */
export function IdleTimer({ idleMs }: { idleMs: number }) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const last = useRef(0);
  const lastWrite = useRef(0);
  const lastPing = useRef(0);
  const leaving = useRef(false);
  const pingEvery = Math.min(5 * 60_000, Math.max(30_000, idleMs / 3));

  const markActive = useCallback(() => {
    const now = Date.now();
    last.current = now;
    if (now - lastWrite.current > 5_000) {
      lastWrite.current = now;
      try {
        localStorage.setItem(KEY, String(now));
      } catch {}
    }
    if (now - lastPing.current > pingEvery) {
      lastPing.current = now;
      void keepAlive().then((r) => {
        if (!r.ok && !leaving.current) {
          leaving.current = true;
          router.replace("/login?idle=1");
        }
      });
    }
  }, [pingEvery, router]);

  useEffect(() => {
    const start = Date.now();
    last.current = start;
    lastPing.current = start; // the page load itself just reached the server
    try {
      localStorage.setItem(KEY, String(start));
    } catch {}

    let lastMove = 0;
    const onEvent = (e: Event) => {
      if (e.type === "mousemove") {
        const now = Date.now();
        if (now - lastMove < 2_000) return;
        lastMove = now;
      }
      markActive();
    };
    for (const name of EVENTS) window.addEventListener(name, onEvent, { passive: true });

    const tick = () => {
      if (leaving.current) return;
      const lastActive = Math.max(last.current, readShared());
      const left = idleMs - (Date.now() - lastActive);
      if (left <= 0) {
        leaving.current = true;
        void signOutIdle().finally(() => router.replace("/login?idle=1"));
        return;
      }
      setSecondsLeft(left <= WARN_MS ? Math.ceil(left / 1000) : null);
    };
    const timer = setInterval(tick, 1_000);
    // A tab coming back from the background checks straight away.
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      for (const name of EVENTS) window.removeEventListener(name, onEvent);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [idleMs, markActive, router]);

  if (secondsLeft === null) return null;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  return (
    <div role="alertdialog" aria-live="assertive" aria-label="You are about to be signed out" className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-8">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-sm shadow-pop">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning">
          <Clock className="size-4.5" />
        </span>
        <p className="min-w-0 flex-1">
          <span className="block font-semibold">
            Signing you out in {minutes}:{seconds}
          </span>
          <span className="block text-muted">You haven&apos;t used the app for a while.</span>
        </p>
        <button
          type="button"
          autoFocus
          onClick={() => {
            lastPing.current = 0; // tell the server right away
            markActive();
            setSecondsLeft(null);
          }}
          className="btn-primary btn-sm shrink-0"
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}

"use client";

import { RotateCw } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { resendCode, verifySignup } from "@/app/actions/auth";
import { FormMessage, SubmitButton } from "@/components/form";

const LENGTH = 6;

/** Six boxes for the code: typing moves forward, backspace moves back, pasting fills them all. */
function CodeBoxes({ onComplete }: { onComplete: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const setFrom = (start: number, text: string) => {
    const clean = text.replace(/\D/g, "").slice(0, LENGTH - start);
    if (!clean) return;
    const next = [...digits];
    clean.split("").forEach((d, i) => (next[start + i] = d));
    setDigits(next);
    const focus = Math.min(start + clean.length, LENGTH - 1);
    refs.current[focus]?.focus();
    if (next.every(Boolean)) setTimeout(onComplete, 0);
  };

  return (
    <div className="flex justify-between gap-2" onPaste={(e) => { e.preventDefault(); setFrom(0, e.clipboardData.getData("text")); }}>
      <input type="hidden" name="code" value={digits.join("")} />
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          maxLength={LENGTH}
          autoFocus={i === 0}
          className="h-14 w-full min-w-0 rounded-xl border border-border bg-surface text-center font-mono text-2xl font-semibold text-text transition outline-none focus:border-primary focus:ring-4 focus:ring-(--ring) sm:h-16"
          onChange={(e) => {
            const v = e.target.value;
            if (v.length > 1) return setFrom(i, v); // autofill or fast typing
            const next = [...digits];
            next[i] = v.replace(/\D/g, "");
            setDigits(next);
            if (next[i] && i < LENGTH - 1) refs.current[i + 1]?.focus();
            if (next.every(Boolean)) setTimeout(onComplete, 0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight" && i < LENGTH - 1) refs.current[i + 1]?.focus();
          }}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

export function VerifyForm({ initialWait }: { initialWait: number }) {
  const [state, action] = useActionState(verifySignup, undefined);
  // "Send a new code" is allowed again at this time (ms).
  const [until, setUntil] = useState(() => Date.now() + initialWait * 1000);
  const [now, setNow] = useState(() => Date.now());
  const [resendState, resendAction, resending] = useActionState(async (prev: Awaited<ReturnType<typeof resendCode>>) => {
    const result = await resendCode(prev);
    if (result?.ok) setUntil(Date.now() + 60_000);
    return result;
  }, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const wait = Math.max(0, Math.ceil((until - now) / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mt-8 space-y-5">
      <form ref={formRef} action={action} className="space-y-5" key={state?.error}>
        <FormMessage error={state?.error} />
        <CodeBoxes onComplete={() => formRef.current?.requestSubmit()} />
        <SubmitButton pendingText="Checking…">Verify and create account</SubmitButton>
      </form>
      <form action={resendAction} className="text-center">
        <FormMessage error={resendState?.error} ok={resendState?.ok} />
        <button
          type="submit"
          disabled={wait > 0 || resending}
          className="btn-ghost mt-2 text-sm disabled:opacity-60"
        >
          <RotateCw className={`size-4 ${resending ? "animate-spin" : ""}`} />
          {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
        </button>
      </form>
    </div>
  );
}

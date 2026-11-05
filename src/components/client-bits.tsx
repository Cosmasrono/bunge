"use client";

import { CheckCircle2, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Re-fetches the page now and then so "in 5 min" stays accurate. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

/** A small confirmation toast that also tidies the URL (?saved=1). */
export function Flash({ message }: { message: string }) {
  const [open, setOpen] = useState(true);
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    router.replace(path, { scroll: false });
    const t = setTimeout(() => setOpen(false), 4000);
    return () => clearTimeout(t);
  }, [router, path]);
  if (!open) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm shadow-pop lg:top-6"
    >
      <CheckCircle2 className="size-5 shrink-0 text-success" />
      <span className="flex-1 font-medium">{message}</span>
      <button onClick={() => setOpen(false)} className="text-faint hover:text-text" aria-label="Dismiss">
        <X className="size-4" />
      </button>
    </div>
  );
}

/** A button that asks before submitting its form. */
export function ConfirmSubmit({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

import { BellRing, CalendarClock, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-[#1e1b4b] p-12 text-white lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-[radial-gradient(circle,#6366f1_0%,transparent_65%)] opacity-60"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-48 -left-32 size-[480px] rounded-full bg-[radial-gradient(circle,#8b5cf6_0%,transparent_65%)] opacity-40"
        />
        <Logo className="relative text-white" />
        <div className="relative mt-auto max-w-md">
          <h2 className="text-[34px] leading-tight font-semibold tracking-tight">
            Never miss what matters on your schedule.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-indigo-100/80">
            Record your meetings and tasks once. We&apos;ll remind you by email a day before, a few hours before, and right
            before it starts.
          </p>
          <ul className="mt-10 space-y-4 text-sm text-indigo-50/90">
            {[
              [CalendarClock, "Repeating events — daily, weekdays, weekly, monthly"],
              [BellRing, "Reminders 1 day, 5 hours, 1 hour and 15 minutes before"],
              [ShieldCheck, "Private and secure — only you see your schedule"],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof BellRing;
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                    <I className="size-4.5" />
                  </span>
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <Logo className="lg:hidden" />
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}

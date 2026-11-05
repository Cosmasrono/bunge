import { BellRing, CalendarClock, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import landing from "@/lib/landing-image.json";

const image = landing.image as { src: string; srcSm: string; alt: string; credit: string } | null;

/**
 * Sign-in pages: a full-screen background (the photo set with `npm run image:landing`, or a brown and pink
 * gradient until there is one) under a dark overlay, with the form on a card. The overlay is at least 60% black, which
 * keeps white text at 4.5:1 or better even over a white part of the photo (WCAG AA).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-[#2b1810] text-white">
      {/* Background */}
      {image ? (
        <picture>
          <source media="(max-width: 767px)" srcSet={image.srcSm} type="image/webp" />
          <img src={image.src} alt={image.alt} fetchPriority="high" decoding="async" className="absolute inset-0 -z-30 size-full object-cover" />
        </picture>
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 -z-30 bg-[linear-gradient(135deg,#3b1f12_0%,#7a4527_48%,#b8205f_100%)]"
        />
      )}
      <div aria-hidden className="absolute inset-0 -z-20 bg-gradient-to-b from-black/60 via-black/60 to-black/75" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-32 -z-10 size-[560px] rounded-full bg-[radial-gradient(circle,#b8205f_0%,transparent_65%)] opacity-30"
      />

      <div className="mx-auto grid min-h-dvh max-w-6xl gap-10 px-5 py-8 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:items-center lg:gap-16">
        <div className="flex flex-col lg:min-h-[70dvh] lg:justify-between">
          <Logo className="text-white" />

          <div className="mt-12 hidden max-w-md lg:block">
            <h2 className="text-[34px] leading-tight font-semibold tracking-tight">Never miss what matters on your schedule.</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/90">
              Record your meetings and tasks once. We&apos;ll remind you a day before, a few hours before, and right before it starts, by email and as a
              notification on your phone.
            </p>
            <ul className="mt-10 space-y-4 text-sm text-white/95">
              {[
                [CalendarClock, "Repeating events: daily, weekdays, weekly, monthly"],
                [BellRing, "Reminders 1 day, 5 hours, 1 hour and 15 minutes before"],
                [ShieldCheck, "Private and secure: only you and your admin see your schedule"],
              ].map(([Icon, text], i) => {
                const I = Icon as typeof BellRing;
                return (
                  <li key={i} className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                      <I className="size-4.5" />
                    </span>
                    {text as string}
                  </li>
                );
              })}
            </ul>
          </div>

          {image?.credit && <p className="mt-10 hidden max-w-md text-xs text-white/85 lg:block">{image.credit}</p>}
        </div>

        <main className="flex flex-col justify-center pb-6 lg:pb-0">
          <div className="w-full rounded-3xl border border-border bg-surface p-6 text-text shadow-pop sm:p-8">{children}</div>
          {image?.credit && <p className="mt-5 text-center text-xs text-white/85 lg:hidden">{image.credit}</p>}
        </main>
      </div>
    </div>
  );
}

import { ArrowUpRight, BellRing, CalendarClock, Check, FileSignature, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import landing from "@/lib/landing-image.json";

const image = landing.image as { src: string; srcSm: string; alt: string; credit: string } | null;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg p-4 sm:p-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6 lg:p-6">
      <a href="#auth-content" className="skip-link">Skip to form</a>
      <aside className="relative isolate hidden min-h-[calc(100dvh-3rem)] flex-col justify-between overflow-hidden rounded-[28px] bg-[#39271f] p-10 text-white lg:flex xl:p-14">
        {image && (
          <>
            <picture>
              <source media="(max-width: 767px)" srcSet={image.srcSm} type="image/webp" />
              <img src={image.src} alt={image.alt} fetchPriority="high" decoding="async" className="absolute inset-0 -z-20 size-full object-cover" />
            </picture>
            <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(38,25,19,0.88),rgba(38,25,19,0.82))]" />
          </>
        )}
        <Link href="/" aria-label="Go to home" className="w-fit"><Logo className="text-white" /></Link>

        <div className="my-14 max-w-lg">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-[11px] font-medium tracking-wider text-[#f3d4e1] uppercase"><span aria-hidden className="size-1.5 rounded-full bg-[#eab4cd]" /> A little more organised</span>
          <h2 className="mt-7 text-[42px] leading-[1.15] font-medium tracking-tight xl:text-[52px]">Make room for<br />what matters.</h2>
          <p className="mt-5 max-w-sm text-[15px] leading-7 text-white/80">Your schedule, reminders, and documents.<br />Together in one simple workspace.</p>

          <div className="mt-10 rounded-2xl border border-white/15 bg-white/[0.07] p-5 backdrop-blur-sm">
            <p className="flex items-center justify-between text-xs font-medium text-white/75">A calmer way to work<ArrowUpRight aria-hidden className="size-4" /></p>
            <div className="mt-5 space-y-4">
              {[
                { icon: CalendarClock, title: "Plan your day", text: "Meetings, tasks, and appointments" },
                { icon: BellRing, title: "Stay a step ahead", text: "Helpful reminders, right on time" },
                { icon: FileSignature, title: "Keep work moving", text: "Send and sign documents easily" },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-[#f3d4e1]"><Icon aria-hidden className="size-[18px]" /></span>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs text-white/70">{text}</p></div>
                  <Check aria-hidden className="size-4 text-[#eab4cd]" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer>
          <p className="flex items-center gap-2 text-xs text-white/80"><ShieldCheck aria-hidden className="size-4" /> Your work, in a secure workspace.</p>
          {image?.credit && <p className="mt-4 max-w-md text-[10px] leading-relaxed text-white/65">{image.credit}</p>}
        </footer>
      </aside>

      <div className="flex min-h-[calc(100dvh-3rem)] flex-col">
        <Link href="/" aria-label="Go to home" className="mx-2 mt-3 w-fit lg:hidden"><Logo /></Link>
        <main id="auth-content" tabIndex={-1} className="flex flex-1 items-center justify-center px-1 py-10 outline-none sm:px-8 lg:py-12">
          <div className="w-full max-w-[420px]">
            <div className="mb-8 flex size-12 items-center justify-center rounded-2xl border border-border bg-surface text-primary shadow-card"><CalendarClock aria-hidden className="size-6" /></div>
            {children}
            <p className="mt-8 flex items-center justify-center gap-1.5 border-t border-border pt-6 text-xs text-faint"><ShieldCheck aria-hidden className="size-3.5" /> A secure space for your everyday work</p>
          </div>
        </main>
        <p className="pb-3 text-center text-xs text-faint">Plan simply. Work calmly.</p>
      </div>
    </div>
  );
}

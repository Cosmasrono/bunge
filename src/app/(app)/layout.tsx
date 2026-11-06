import { CalendarDays, LogOut } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { NavLinks, RouteHeading } from "@/components/nav";
import { NoticePopups } from "@/components/notice-popups";
import { IdleTimer } from "@/components/idle-timer";
import { IDLE_MS, requireUser } from "@/lib/auth/session";
import { ROLE_LABEL } from "@/lib/auth/permissions";

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const isManager = isAdmin || user.role === "director";
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: user.timezone, weekday: "short", day: "numeric", month: "short" }).format(new Date());
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface px-4 py-7 lg:flex">
        <Link href="/" aria-label="Go to schedule" className="mx-2 w-fit"><Logo /></Link>
        <p className="mt-11 mb-3 px-3.5 text-[10px] font-semibold tracking-[0.18em] text-faint uppercase">Workspace</p>
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto">
          <NavLinks isAdmin={isAdmin} isManager={isManager} variant="sidebar" />
        </nav>
        <div className="mt-6 flex items-center gap-2 border-t border-border pt-4">
          <Link href="/account" aria-label="Your account" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-surface-2">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
            {initials(user.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{user.name}</span>
            <span className="block text-xs text-faint">{ROLE_LABEL[user.role]}</span>
          </span>
          </Link>
          <form action={logout}>
            <button className="btn-ghost size-11 p-0" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between gap-4 border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6 lg:px-10">
          <Link href="/" aria-label="Go to schedule" className="lg:hidden"><Logo /></Link>
          <div className="hidden lg:block"><RouteHeading /></div>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-2 text-xs text-muted sm:flex"><CalendarDays aria-hidden className="size-4" />{date}</span>
            <Link href="/account" aria-label="Your account" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-primary-soft text-xs font-semibold text-primary">{initials(user.name)}</Link>
            <form action={logout} className="lg:hidden"><button className="btn-ghost size-11 p-0" aria-label="Sign out"><LogOut className="size-4" /></button></form>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 pt-7 pb-32 outline-none sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">{children}</main>
      </div>
      <IdleTimer idleMs={IDLE_MS} />

      <NoticePopups />

      <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <NavLinks isAdmin={isAdmin} isManager={isManager} variant="tabs" />
      </nav>
    </div>
  );
}

import { LogOut } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { NavLinks } from "@/components/nav";
import { NoticePopups } from "@/components/notice-popups";
import { requireUser } from "@/lib/auth/session";

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const isManager = isAdmin || user.role === "director";
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface px-4 py-6 lg:flex">
        <Logo className="px-2" />
        <nav className="mt-8 flex-1">
          <NavLinks isAdmin={isAdmin} isManager={isManager} variant="sidebar" />
        </nav>
        <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-faint">{user.email}</p>
          </div>
          <form action={logout}>
            <button className="btn-ghost size-9 p-0" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>

      {/* Top bar (mobile) */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface/85 px-4 backdrop-blur lg:hidden">
        <Logo />
        <form action={logout}>
          <button className="btn-ghost btn-sm" aria-label="Sign out">
            <LogOut className="size-4" />
          </button>
        </form>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">{children}</main>

      <NoticePopups />

      {/* Bottom tabs (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <NavLinks isAdmin={isAdmin} isManager={isManager} variant="tabs" />
      </nav>
    </div>
  );
}

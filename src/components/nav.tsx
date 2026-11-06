"use client";

import { CalendarDays, ChevronRight, FileSignature, Settings2, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Schedule", icon: CalendarDays, match: (p: string) => p === "/" || p.startsWith("/events") },
  { href: "/documents", label: "Documents", icon: FileSignature, match: (p: string) => p.startsWith("/documents") },
  { href: "/team", label: "Team", icon: Users, match: (p: string) => p.startsWith("/team"), manager: true },
  { href: "/account", label: "Account", icon: UserRound, match: (p: string) => p.startsWith("/account") },
  { href: "/settings", label: "Settings", icon: Settings2, match: (p: string) => p.startsWith("/settings"), admin: true },
];

export function NavLinks({ isAdmin, isManager, variant }: { isAdmin: boolean; isManager: boolean; variant: "sidebar" | "tabs" }) {
  const path = usePathname();
  const links = LINKS.filter((l) => (!("admin" in l) || isAdmin) && (!("manager" in l) || isManager));

  if (variant === "tabs") {
    return (
      <ul className="mx-auto flex max-w-lg gap-1 px-2">
        {links.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`my-1.5 flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors ${active ? "bg-primary-soft text-primary" : "text-faint hover:bg-surface-2"}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className="space-y-1.5">
      {links.map(({ href, label, icon: Icon, match }) => {
        const active = match(path);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors ${
                active ? "bg-primary-soft font-semibold text-primary" : "text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              <Icon className="size-[18px]" />
              {label}
              {active && <span aria-hidden className="ml-auto size-1.5 rounded-full bg-accent" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function RouteHeading() {
  const path = usePathname();
  const current = LINKS.find((link) => link.match(path));
  const detail = path === "/events/new" ? "New event"
    : path.startsWith("/events/") ? "Event details"
    : path === "/documents/new" ? "Send a document"
    : path.startsWith("/documents/") ? "Document details" : null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-faint">Workspace</span>
      <ChevronRight aria-hidden className="size-3.5 text-faint" />
      {detail ? <><Link href={current?.href ?? "/"} className="text-muted hover:text-primary">{current?.label ?? "Schedule"}</Link><ChevronRight aria-hidden className="size-3.5 text-faint" /><span className="font-medium">{detail}</span></>
        : <span className="font-medium">{current?.label ?? "Schedule"}</span>}
    </div>
  );
}

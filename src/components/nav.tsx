"use client";

import { CalendarDays, FileSignature, Settings2, UserRound, Users } from "lucide-react";
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
      <ul className="flex">
        {links.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active ? "text-primary" : "text-faint"}`}
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
    <ul className="space-y-1">
      {links.map(({ href, label, icon: Icon, match }) => {
        const active = match(path);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              <Icon className="size-[18px]" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

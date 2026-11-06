import { ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, back, actions }: {
  eyebrow?: string;
  title: string;
  description?: string;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7">
      {back && <Link href={back.href} className="btn-ghost -ml-2 mb-4 px-2"><ArrowLeft aria-hidden className="size-4" />{back.label}</Link>}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-64">
          {eyebrow && <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-faint uppercase">{eyebrow}</p>}
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-[32px]">{title}</h1>
          {description && <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function SectionHeading({ title, description, icon: Icon, step }: { title: string; description?: string; icon?: LucideIcon; step?: string }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      {(Icon || step) && <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-sm font-semibold text-primary">{Icon ? <Icon aria-hidden className="size-[18px]" /> : step}</span>}
      <div className="min-w-0"><h2 className="font-semibold">{title}</h2>{description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}</div>
    </div>
  );
}

export function SectionNav({ items }: { items: { id: string; label: string; icon: LucideIcon }[] }) {
  return (
    <nav aria-label="On this page" className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1.5 lg:sticky lg:top-28 lg:flex-col lg:gap-1 lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0">
      {items.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-primary-soft hover:text-primary"><Icon aria-hidden className="size-4 shrink-0" />{label}</a>)}
    </nav>
  );
}

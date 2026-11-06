import { CalendarCheck2 } from "lucide-react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 font-semibold tracking-tight ${className}`}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-text shadow-sm">
        <CalendarCheck2 className="size-5" />
      </span>
      <span className="text-lg">{process.env.APP_NAME || "PRS"}<span className="mt-0.5 block text-[9px] leading-none font-medium tracking-[0.12em] whitespace-nowrap uppercase opacity-65">Your everyday desk</span></span>
    </div>
  );
}

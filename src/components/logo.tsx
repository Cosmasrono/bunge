import { CalendarCheck2 } from "lucide-react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 font-semibold tracking-tight ${className}`}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
        <CalendarCheck2 className="size-5" />
      </span>
      <span className="text-[17px]">{process.env.APP_NAME || "Nation Desk"}</span>
    </div>
  );
}

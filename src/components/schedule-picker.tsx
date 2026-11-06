"use client";

import { Loader2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function SchedulePicker({ people, value }: { people: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3 sm:px-4">
      <label htmlFor="schedule-owner" className="flex items-center gap-2 text-sm font-medium text-muted">
        <Users aria-hidden className="size-4" /> Viewing
      </label>
      <select
        id="schedule-owner"
        className="input h-10 w-full sm:w-64"
        value={value}
        disabled={pending}
        onChange={(event) => {
          const id = event.target.value;
          startTransition(() => router.push(id ? `/?for=${encodeURIComponent(id)}` : "/"));
        }}
      >
        <option value="">My schedule</option>
        {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select>
      {pending && <span role="status" className="flex items-center gap-2 text-xs text-muted"><Loader2 aria-hidden className="size-4 animate-spin" /> Loading schedule…</span>}
    </div>
  );
}

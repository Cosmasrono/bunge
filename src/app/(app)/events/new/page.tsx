import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createEvent } from "@/app/actions/events";
import { EventForm } from "@/components/event-form";
import { canScheduleForOthers } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/db";
import { listPeople } from "@/lib/events";
import { eventFormOptions } from "@/lib/event-form-options";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage({ searchParams }: PageProps<"/events/new">) {
  const user = await requireUser();
  const people = canScheduleForOthers(user) ? await listPeople(user.id) : undefined;
  const groups = people
    ? await (async () => {
        const db = getDb();
        const [all, directors, staff] = await Promise.all([db.user.count(), db.user.count({ where: { role: "director" } }), db.user.count({ where: { role: "staff" } })]);
        return [
          { value: "all", label: "Everyone", count: all },
          { value: "directors", label: "All directors", count: directors },
          { value: "staff", label: "All staff", count: staff },
        ];
      })()
    : undefined;
  const sp = await searchParams;
  const forDefault = typeof sp.for === "string" && (people?.some((p) => p.id === sp.for) || ["all", "directors", "staff"].includes(sp.for)) ? sp.for : undefined;
  const o = eventFormOptions(user.timezone);
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/" className="btn-ghost -ml-2 px-2">
        <ArrowLeft className="size-4" /> Schedule
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-semibold tracking-tight">New event</h1>
      <EventForm
        action={createEvent}
        submitLabel="Save event"
        timezone={user.timezone}
        leadOptions={o.leadOptions}
        repeatOptions={o.repeatOptions}
        quickDates={o.quickDates}
        people={people}
        groups={groups}
        forDefault={forDefault}
        initial={{
          title: "",
          date: o.defaults.date,
          time: o.defaults.time,
          repeat: "none",
          location: "",
          notes: "",
          leads: [1440, 300, 60, 15],
          emailReminders: true,
        }}
      />
    </div>
  );
}

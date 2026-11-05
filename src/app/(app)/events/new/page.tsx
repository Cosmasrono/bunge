import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createEvent } from "@/app/actions/events";
import { EventForm } from "@/components/event-form";
import { requireUser } from "@/lib/auth/session";
import { eventFormOptions } from "@/lib/event-form-options";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage() {
  const user = await requireUser();
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

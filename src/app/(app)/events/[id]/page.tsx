import { ArrowLeft, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteEvent, updateEvent } from "@/app/actions/events";
import { ConfirmSubmit } from "@/components/client-bits";
import { EventForm } from "@/components/event-form";
import { requireUser } from "@/lib/auth/session";
import { getEventFor } from "@/lib/events";
import { eventFormOptions } from "@/lib/event-form-options";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: PageProps<"/events/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const event = await getEventFor(user, id);
  if (!event) notFound();
  const o = eventFormOptions(event.timezone);
  const [date, time] = event.startLocal.split("T");

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/" className="btn-ghost -ml-2 px-2">
        <ArrowLeft className="size-4" /> Schedule
      </Link>
      <div className="mt-3 mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit event</h1>
          {event.userId !== user.id && <p className="mt-1 text-sm text-muted">On {event.user.name}&apos;s schedule</p>}
        </div>
        <form action={deleteEvent.bind(null, event.id)}>
          <ConfirmSubmit message={`Delete "${event.title}"? This can't be undone.`} className="btn-danger btn-sm">
            <Trash2 className="size-3.5" /> Delete
          </ConfirmSubmit>
        </form>
      </div>
      <EventForm
        action={updateEvent.bind(null, event.id)}
        submitLabel="Save changes"
        timezone={event.timezone}
        leadOptions={o.leadOptions}
        repeatOptions={o.repeatOptions}
        quickDates={o.quickDates}
        initial={{
          title: event.title,
          date,
          time,
          repeat: event.repeat,
          location: event.location,
          notes: event.notes,
          leads: event.leads,
          emailReminders: event.emailReminders,
        }}
      />
    </div>
  );
}

import { Trash2 } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { notFound } from "next/navigation";
import { deleteEvent, deleteEventForAll, updateEvent } from "@/app/actions/events";
import { getDb } from "@/db";
import { canScheduleForOthers } from "@/lib/auth/permissions";
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
  // One copy of an event added for a group: people who schedule for others can change or delete all copies.
  const batchCount = event.batchId && canScheduleForOthers(user) ? await getDb().event.count({ where: { batchId: event.batchId } }) : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={{ href: "/", label: "Schedule" }} title="Edit event" description={event.userId !== user.id ? `Update ${event.title} on ${event.user.name}'s schedule.` : `Update the details and reminders for ${event.title}.`} />
      <EventForm
        action={updateEvent.bind(null, event.id)}
        submitLabel="Save changes"
        timezone={event.timezone}
        leadOptions={o.leadOptions}
        repeatOptions={o.repeatOptions}
        quickDates={o.quickDates}
        batchCount={batchCount}
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
      <section className="mt-8 rounded-2xl border border-danger/20 bg-surface p-5 sm:p-6">
        <h2 className="font-semibold">Remove this event</h2>
        <p className="mt-1 text-sm text-muted">Deleting an event also removes its reminders. This cannot be undone.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={deleteEvent.bind(null, event.id)}>
            <ConfirmSubmit message={`Delete "${event.title}"${batchCount && batchCount > 1 ? " from this schedule only" : ""}? This can't be undone.`} className="btn-danger">
              <Trash2 className="size-4" />{batchCount && batchCount > 1 ? "Delete this copy" : "Delete event"}
            </ConfirmSubmit>
          </form>
          {batchCount !== undefined && batchCount > 1 && <form action={deleteEventForAll.bind(null, event.id)}>
            <ConfirmSubmit message={`Delete "${event.title}" from all ${batchCount} schedules? Everyone is told it was cancelled. This can't be undone.`} className="btn-danger"><Trash2 className="size-4" />Delete for everyone ({batchCount})</ConfirmSubmit>
          </form>}
        </div>
      </section>
    </div>
  );
}

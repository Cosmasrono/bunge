import { BellOff, BellRing, CalendarPlus, ChevronRight, Clock, MapPin, Plus, Repeat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh, Flash } from "@/components/client-bits";
import { requireUser } from "@/lib/auth/session";
import { getSchedule, listPeople, type ScheduleItem } from "@/lib/events";
import { mailConfigured } from "@/lib/mail";
import { dayKey, dayLabel, formatTime, formatWhen, humanUntil, leadLabel, REPEAT_LABELS, utcToWall } from "@/lib/time";

export const metadata: Metadata = { title: "Schedule" };

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function SchedulePage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const sp = await searchParams;
  // Admins can look at (and add events to) a director's schedule with ?for=<id>.
  const people = user.role === "admin" ? await listPeople(user.id) : [];
  const viewing = typeof sp.for === "string" ? (people.find((p) => p.id === sp.for) ?? null) : null;
  const owner = viewing ?? user;
  const newHref = viewing ? `/events/new?for=${viewing.id}` : "/events/new";
  const tz = owner.timezone;
  const now = new Date();
  const { upcoming, past } = await getSchedule(owner.id, now);
  const flash = sp.welcome
    ? "Email confirmed — your account is ready!"
    : sp.saved
      ? "Event saved. Reminders are set."
      : sp.deleted
        ? "Event deleted."
        : null;

  const [next, ...rest] = upcoming;
  const groups = new Map<string, { label: string; items: ScheduleItem[] }>();
  for (const item of rest) {
    const key = dayKey(item.next!, tz);
    if (!groups.has(key)) groups.set(key, { label: dayLabel(item.next!, tz, now), items: [] });
    groups.get(key)!.items.push(item);
  }

  return (
    <div>
      <AutoRefresh seconds={60} />
      {flash && <Flash message={flash} />}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-faint">
            {formatWhen(now, tz, { weekday: "long", day: "numeric", month: "long", hour: undefined, minute: undefined })}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">
            {viewing ? `${viewing.name}'s schedule` : `${greeting(utcToWall(now, tz).h)}, ${user.name.split(" ")[0]}`}
          </h1>
        </div>
        <Link href={newHref} className="btn-primary hidden sm:inline-flex">
          <Plus className="size-4" /> New event
        </Link>
      </div>

      {people.length > 0 && (
        <nav aria-label="Whose schedule" className="mt-5 flex flex-wrap gap-2">
          {[{ id: "", name: "My schedule" }, ...people].map((p) => {
            const active = (viewing?.id ?? "") === p.id;
            return (
              <Link
                key={p.id || "me"}
                href={p.id ? `/?for=${p.id}` : "/"}
                aria-current={active ? "page" : undefined}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:bg-surface-2"
                }`}
              >
                {p.name}
              </Link>
            );
          })}
        </nav>
      )}

      {!mailConfigured() && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-warning/25 bg-warning-soft px-4 py-3.5 text-sm text-warning">
          <BellOff className="mt-0.5 size-4 shrink-0" />
          <p>
            <b>Email reminders are off</b> — the server&apos;s email settings aren&apos;t filled in yet.
            {user.role === "admin" && (
              <>
                {" "}
                <Link href="/settings" className="font-semibold underline underline-offset-2">
                  See how to set it up
                </Link>
              </>
            )}
          </p>
        </div>
      )}

      {!next ? (
        <div className="card mt-8 flex flex-col items-center px-6 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <CalendarPlus className="size-6" />
          </span>
          <h2 className="mt-5 text-lg font-semibold">{viewing ? `${viewing.name}'s schedule is empty` : "Your schedule is empty"}</h2>
          <p className="mt-1.5 max-w-sm text-[15px] text-muted">
            {viewing
              ? `Add a meeting or task. ${viewing.name.split(" ")[0]} will be reminded before it starts.`
              : "Add your first meeting, task or appointment and we'll remind you before it starts."}
          </p>
          <Link href={newHref} className="btn-primary mt-6">
            <Plus className="size-4" /> Add an event
          </Link>
        </div>
      ) : (
        <>
          <NextUp item={next} tz={tz} now={now} />
          {groups.size > 0 && (
            <div className="mt-10 space-y-8">
              {[...groups.entries()].map(([key, g]) => (
                <section key={key}>
                  <h2 className="mb-3 text-xs font-semibold tracking-wider text-faint uppercase">{g.label}</h2>
                  <ul className="card divide-y divide-border overflow-hidden">
                    {g.items.map((item) => (
                      <EventRowView key={item.id} item={item} tz={tz} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {past.length > 0 && (
        <details className="group mt-10">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-muted hover:text-text">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
            Past events ({past.length})
          </summary>
          <ul className="card mt-3 divide-y divide-border overflow-hidden opacity-75">
            {past.map((item) => (
              <EventRowView key={item.id} item={item} tz={tz} past />
            ))}
          </ul>
        </details>
      )}

      {/* Floating add button on phones */}
      <Link
        href={newHref}
        aria-label="New event"
        className="fixed right-5 bottom-24 z-10 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-text shadow-pop sm:hidden"
      >
        <Plus className="size-6" />
      </Link>
    </div>
  );
}

function ReminderChips({ item }: { item: ScheduleItem }) {
  return (
    <>
      {item.addedBy && <span className="chip bg-accent-soft text-accent">Added by {item.addedBy}</span>}
      {item.repeat !== "none" && (
        <span className="chip">
          <Repeat className="size-3" /> {REPEAT_LABELS[item.repeat]}
        </span>
      )}
      {item.emailReminders && item.leads.length ? (
        <span className="chip">
          <BellRing className="size-3" /> {item.leads.map(leadLabel).join(" · ")}
        </span>
      ) : (
        <span className="chip">
          <BellOff className="size-3" /> No reminders
        </span>
      )}
    </>
  );
}

function NextUp({ item, tz, now }: { item: ScheduleItem; tz: string; now: Date }) {
  return (
    <Link
      href={`/events/${item.id}`}
      className="group relative mt-8 block overflow-hidden rounded-3xl bg-gradient-to-br from-[#7a4527] via-[#8c3a49] to-[#b8205f] p-6 text-white shadow-pop sm:p-8"
    >
      <div aria-hidden className="absolute -top-24 -right-16 size-72 rounded-full bg-white/10 blur-2xl" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/20">
            <Clock className="size-3.5" /> Next up · {humanUntil(item.next!.getTime() - now.getTime())}
          </span>
          <ChevronRight className="size-5 opacity-60 transition-transform group-hover:translate-x-0.5" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-[28px]">{item.title}</h2>
        <p className="mt-2 text-[15px] text-white/90">
          {dayLabel(item.next!, tz, now)} · {formatTime(item.next!, tz)}
          {item.location && (
            <>
              {" "}
              · <MapPin className="inline size-3.5 -translate-y-px" /> {item.location}
            </>
          )}
        </p>
        {item.notes && <p className="mt-3 line-clamp-2 max-w-xl text-sm text-white/90">{item.notes}</p>}
        <div className="mt-5 flex flex-wrap gap-2 [&_.chip]:bg-white/15 [&_.chip]:text-white">
          <ReminderChips item={item} />
        </div>
      </div>
    </Link>
  );
}

function EventRowView({ item, tz, past = false }: { item: ScheduleItem; tz: string; past?: boolean }) {
  const when = past ? item.startUtc : item.next!;
  return (
    <li>
      <Link href={`/events/${item.id}`} className="flex items-start gap-4 px-4 py-4 transition-colors hover:bg-surface-2 sm:px-5">
        <div className="w-16 shrink-0 pt-0.5 text-sm font-semibold tabular-nums sm:w-20">
          {past ? formatWhen(when, tz, { weekday: undefined, hour: undefined, minute: undefined }) : formatTime(when, tz)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.title}</p>
          {item.location && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted">
              <MapPin className="size-3.5 shrink-0" /> {item.location}
            </p>
          )}
          {!past && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ReminderChips item={item} />
            </div>
          )}
        </div>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-faint" />
      </Link>
    </li>
  );
}

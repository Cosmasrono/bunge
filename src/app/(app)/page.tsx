import { ArrowUpRight, BellOff, BellRing, CalendarDays, CalendarPlus, ChevronRight, Clock, MapPin, Plus, Repeat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh, Flash } from "@/components/client-bits";
import { SchedulePicker } from "@/components/schedule-picker";
import { canScheduleForOthers } from "@/lib/auth/permissions";
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
  // People allowed to schedule for others can look at (and add events to) anyone's schedule with ?for=<id>.
  const people = canScheduleForOthers(user) ? await listPeople(user.id) : [];
  const viewing = typeof sp.for === "string" ? (people.find((p) => p.id === sp.for) ?? null) : null;
  const owner = viewing ?? user;
  const newHref = viewing ? `/events/new?for=${viewing.id}` : "/events/new";
  const tz = owner.timezone;
  const now = new Date();
  const { upcoming, past } = await getSchedule(owner.id, now);
  const todayCount = upcoming.filter((item) => dayKey(item.next!, tz) === dayKey(now, tz)).length;
  const reminderCount = upcoming.filter((item) => item.emailReminders && item.leads.length > 0).length;
  const flash = typeof sp.added === "string" && Number(sp.added) > 1
    ? `Event added to ${Number(sp.added)} schedules. Everyone was notified.`
    : sp.welcome
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
          <p className="text-[11px] font-semibold tracking-[0.16em] text-faint uppercase">Your day, at a glance</p>
          <h1 className="mt-2 text-[26px] leading-tight font-semibold tracking-tight sm:text-[32px]">
            {viewing ? `${viewing.name}'s schedule` : `${greeting(utcToWall(now, tz).h)}, ${user.name.split(" ")[0]}`}
          </h1>
        </div>
        <Link href={newHref} className="btn-primary">
          <Plus className="size-4" /> New event
        </Link>
      </div>

      {people.length > 0 && (
        <div className="mt-6"><SchedulePicker people={people.map(({ id, name }) => ({ id, name }))} value={viewing?.id ?? ""} /></div>
      )}

      <dl className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: "Today", value: todayCount, hint: "events scheduled", icon: CalendarDays, color: "bg-primary-soft text-primary" },
          { label: "Upcoming", value: upcoming.length, hint: "events ahead", icon: Clock, color: "bg-accent-soft text-accent" },
          { label: "With reminders", value: reminderCount, hint: "events with alerts", icon: BellRing, color: "bg-success-soft text-success" },
        ].map(({ label, value, hint, icon: Icon, color }) => (
          <div key={label} className="card flex items-center justify-between gap-2 p-3 sm:p-5">
            <div><dt className="text-xs font-medium text-muted">{label}</dt><dd className="mt-1 text-2xl leading-tight font-semibold tracking-tight tabular-nums sm:text-3xl">{value}<span className="mt-1 hidden text-xs leading-relaxed font-normal tracking-normal text-faint sm:block">{hint}</span></dd></div>
            <span className={`hidden size-10 shrink-0 items-center justify-center rounded-xl sm:flex ${color}`}><Icon aria-hidden className="size-[18px]" /></span>
          </div>
        ))}
      </dl>

      {!mailConfigured() && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-warning/25 bg-warning-soft px-4 py-3.5 text-sm text-warning">
          <BellOff className="mt-0.5 size-4 shrink-0" />
          <p>
            <b>Email reminders are off.</b> {user.role === "admin" ? "Connect your email in Settings to start sending reminders." : "Ask your administrator to enable email reminders."}
            {user.role === "admin" && (
              <>
                {" "}
                <Link href="/settings" className="font-semibold underline underline-offset-2">
                  Open settings
                </Link>
              </>
            )}
          </p>
        </div>
      )}

      {!next ? (
        <div className="card mt-6 flex flex-col items-center px-6 py-16 text-center sm:py-20">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <CalendarPlus className="size-6" />
          </span>
          <h2 className="mt-5 text-xl font-semibold">{viewing ? `${viewing.name}'s schedule is clear` : "A clear schedule. A fresh start."}</h2>
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
            <div className="mt-8 space-y-6">
              {[...groups.entries()].map(([key, g]) => (
                <section key={key}>
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">{g.label}<span className="chip">{g.items.length}</span></h2>
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

      <p className="mt-7 flex items-center gap-1.5 text-xs text-faint"><Clock aria-hidden className="size-3.5" /> All times in {tz.replace(/_/g, " ")}</p>
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
      className="group relative mt-6 block overflow-hidden rounded-2xl bg-[#53372c] p-6 text-white shadow-card transition-colors hover:bg-[#624234] sm:p-8"
    >
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium">
            <Clock className="size-3.5" /> Next up · {humanUntil(item.next!.getTime() - now.getTime())}
          </span>
          <ArrowUpRight aria-hidden className="size-5 text-[#edc6d6] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
        <h2 className="mt-6 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-[28px]">{item.title}</h2>
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
        <div className="mt-6 flex flex-wrap gap-2 border-t border-white/15 pt-5 [&_.chip]:bg-white/10 [&_.chip]:text-white">
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
      <Link href={`/events/${item.id}`} className="flex items-start gap-4 px-4 py-5 transition-colors hover:bg-surface-2 sm:px-5">
        <div className="w-20 shrink-0 border-r border-border pt-0.5 pr-2 text-sm font-semibold whitespace-nowrap text-primary tabular-nums sm:w-24">
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

/**
 * Who may do what. Admins and directors may do everything here; staff only what a director or admin allowed.
 * (Settings stays admin-only, and only admins can create admins or directors, or change roles.)
 */
type Person = { role: string; canSchedule?: boolean | null; canSendDocuments?: boolean | null };

export const ROLE_LABEL = { admin: "Admin", director: "Director", staff: "Staff" } as const;
export type RoleName = keyof typeof ROLE_LABEL;

/** Admins and directors: manage people and permissions on the Team page. */
export const isManager = (u: Person) => u.role === "admin" || u.role === "director";

/** Add, see and change events on other people's schedules. */
export const canScheduleForOthers = (u: Person) => isManager(u) || u.canSchedule === true;

/** Upload documents and send them for signing. Everyone can sign what is sent to them. */
export const canSendDocuments = (u: Person) => isManager(u) || u.canSendDocuments === true;

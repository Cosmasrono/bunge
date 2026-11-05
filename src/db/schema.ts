// Shared types and constants for the data model in prisma/schema.prisma.
// (No Prisma runtime import here, so client components can use REPEAT_OPTIONS.)
import type { Event, Repeat as PrismaRepeat, User as PrismaUser } from "@prisma/client";

export const REPEAT_OPTIONS = ["none", "daily", "weekdays", "weekly", "monthly"] as const satisfies readonly PrismaRepeat[];
export type Repeat = (typeof REPEAT_OPTIONS)[number];

export type User = PrismaUser;
export type EventRow = Event;

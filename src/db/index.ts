/**
 * Database connection: MongoDB (e.g. Atlas) through Prisma, using DATABASE_URL.
 * The schema lives in prisma/schema.prisma; apply it with `npm run db:push`.
 */
import { PrismaClient } from "@prisma/client";

const globalForDb = globalThis as unknown as { __prisma?: PrismaClient };

function create() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add your MongoDB connection string to .env (see .env.example).");
  }
  return new PrismaClient();
}

/** Lazily created, one per server process (also survives dev hot reloads). */
export function getDb(): PrismaClient {
  return (globalForDb.__prisma ??= create());
}

/** True for a 24-character hex MongoDB ObjectId. Check ids from URLs, forms and cookies before querying. */
export function isObjectId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{24}$/i.test(value);
}

/** True when Prisma rejected a write because of a unique index (used to "claim" work exactly once). */
export function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

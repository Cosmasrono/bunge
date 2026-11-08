// Removes every account except the names given, along with what belongs to them: sessions, schedules, notifications,
// and documents they sent. The audit log is kept, with the person's name detached.
//
//   node scripts/keep-only-users.mjs developer jepchirchir          -> only shows what would be removed (changes nothing)
//   node scripts/keep-only-users.mjs developer jepchirchir --yes    -> removes it. This can't be undone.
//
// Uses DATABASE_URL from .env (or .env.local). Check the database name it prints before using --yes.
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
const args = process.argv.slice(2);
const really = args.includes("--yes");
const keepNames = args.filter((a) => a !== "--yes").map((a) => a.toLowerCase());
if (!keepNames.length) {
  console.error("Name the accounts to keep, for example: node scripts/keep-only-users.mjs developer jepchirchir");
  process.exit(1);
}

const db = new PrismaClient();
const users = await db.user.findMany({ select: { id: true, name: true, email: true, role: true } });
const keep = users.filter((u) => keepNames.includes(u.name.toLowerCase()));
const missing = keepNames.filter((n) => !keep.some((u) => u.name.toLowerCase() === n));
if (missing.length) {
  console.error(`No account named: ${missing.join(", ")}. Nothing was changed.`);
  process.exit(1);
}
if (!keep.some((u) => u.role === "admin")) {
  console.error("None of the accounts to keep is an admin, so nobody could manage the app. Nothing was changed.");
  process.exit(1);
}

const remove = users.filter((u) => !keep.includes(u));
const ids = remove.map((u) => u.id);
const byUser = { userId: { in: ids } };
const events = await db.event.findMany({ where: byUser, select: { id: true } });
const eventIds = events.map((e) => e.id);
const docs = await db.document.findMany({ where: { senderId: { in: ids } }, select: { id: true, title: true, fileKey: true, signedFileKey: true } });
const docIds = docs.map((d) => d.id);
const signerRows = await db.documentSigner.findMany({ where: { userId: { in: ids }, documentId: { notIn: docIds } }, select: { eventId: true, document: { select: { title: true, status: true } } } });
const fileKeys = docs.flatMap((d) => [d.fileKey, d.signedFileKey].filter(Boolean));

console.log(`Database: ${process.env.DATABASE_URL.replace(/^.*@/, "").split("?")[0]}`);
console.log(`Keeping: ${keep.map((u) => `${u.name} (${u.role})`).join(", ")}`);
console.log(`Removing: ${remove.map((u) => `${u.name} (${u.role})`).join(", ") || "nobody"}`);
console.log(`Their events on their own schedules: ${events.length}`);
console.log(`Documents they sent (with PDFs): ${docs.length}${docs.length ? ` - ${docs.map((d) => d.title).join(", ")}` : ""}`);
console.log(`Their signatures on documents from people being kept: ${signerRows.length}${signerRows.length ? ` - ${signerRows.map((r) => `${r.document.title} (${r.document.status})`).join(", ")}` : ""}`);

if (!really) {
  console.log(`\nNothing was changed. To do this, add --yes to the end of the command.`);
} else {
  await db.reminderSent.deleteMany({ where: { eventId: { in: eventIds } } });
  await db.event.deleteMany({ where: { id: { in: eventIds } } });
  await db.documentSigner.deleteMany({ where: { OR: [{ documentId: { in: docIds } }, byUser] } });
  await db.document.deleteMany({ where: { id: { in: docIds } } });
  await db.storedFile.deleteMany({ where: { key: { in: fileKeys } } });
  await db.session.deleteMany({ where: byUser });
  await db.passwordReset.deleteMany({ where: byUser });
  await db.pushSubscription.deleteMany({ where: byUser });
  await db.notice.deleteMany({ where: byUser });
  await db.messageLog.deleteMany({ where: byUser });
  await db.auditLog.updateMany({ where: byUser, data: { userId: null } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`\nDone. Only ${keep.map((u) => u.name).join(" and ")} remain.`);
}
await db.$disconnect();

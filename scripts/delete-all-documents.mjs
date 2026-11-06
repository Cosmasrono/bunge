// Deletes ALL documents from the app: the PDFs, every signer's signature and signing details, the "Sign: …" deadline
// events on people's schedules, and document notifications. Users, schedules (other events) and the audit log stay.
//
//   node scripts/delete-all-documents.mjs          -> only shows what would be deleted (changes nothing)
//   node scripts/delete-all-documents.mjs --yes    -> deletes it. This can't be undone.
//
// Uses DATABASE_URL from .env (or .env.local). Check the database name it prints before using --yes.
import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const dbName = process.env.DATABASE_URL.match(/\/\/[^/]*\/([^?]*)/)?.[1] || "(none: MongoDB uses 'test')";
const really = process.argv.includes("--yes");
const db = new PrismaClient();

const signers = await db.documentSigner.findMany({ select: { eventId: true } });
const eventIds = signers.map((s) => s.eventId).filter(Boolean);
const counts = {
  documents: await db.document.count(),
  signers: signers.length,
  storedPdfs: await db.storedFile.count(),
  deadlineEvents: eventIds.length,
  documentNotices: await db.notice.count({ where: { url: { startsWith: "/documents/" } } }),
};
// PDFs saved on this PC by older versions of the app.
const oldDir = process.env.DOCS_DIR || path.join(homedir(), ".nation-desk", "documents");
const oldFiles = existsSync(oldDir) ? (await readdir(oldDir)).filter((f) => /^[a-f0-9]{32}\.pdf$/.test(f)) : [];

console.log(`Database: ${dbName}`);
console.log(`Documents: ${counts.documents}`);
console.log(`Signer records (signatures, locations, IPs): ${counts.signers}`);
console.log(`Stored PDF files (originals and signed copies): ${counts.storedPdfs}`);
console.log(`"Sign: ..." deadline events on schedules: ${counts.deadlineEvents}`);
console.log(`Document notifications: ${counts.documentNotices}`);
console.log(`Old PDF files on this PC (${oldDir}): ${oldFiles.length}`);

if (!really) {
  console.log("\nNothing was deleted. To delete all of the above, run:  node scripts/delete-all-documents.mjs --yes");
} else {
  if (eventIds.length) {
    await db.reminderSent.deleteMany({ where: { eventId: { in: eventIds } } });
    await db.event.deleteMany({ where: { id: { in: eventIds } } });
  }
  await db.documentSigner.deleteMany({});
  await db.document.deleteMany({});
  await db.storedFile.deleteMany({});
  await db.notice.deleteMany({ where: { url: { startsWith: "/documents/" } } });
  for (const f of oldFiles) await rm(path.join(oldDir, f), { force: true });
  console.log("\nDeleted. The Documents page is now empty.");
}
await db.$disconnect();

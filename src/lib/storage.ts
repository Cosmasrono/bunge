import "server-only";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { getDb } from "@/db";

/**
 * File storage for uploaded and signed PDFs: the `stored_files` collection in the app's MongoDB database.
 * That works the same on your PC and on hosting without a permanent disk (Vercel), and is backed up with the data.
 *
 * Files saved by older versions of the app lived in a folder on the PC (DOCS_DIR, default ~/.nation-desk/documents);
 * they are still read from there when a file isn't in the database.
 */
const KEY_PATTERN = /^[a-f0-9]{32}\.pdf$/;

function checkKey(key: string) {
  if (!KEY_PATTERN.test(key)) throw new Error("Invalid file key");
}

export function newFileKey() {
  return `${randomBytes(16).toString("hex")}.pdf`;
}

/** Saves a new file. Keys are random and unique; an existing key is never overwritten (the unique index refuses it). */
export async function putFile(key: string, bytes: Uint8Array) {
  checkKey(key);
  await getDb().storedFile.create({ data: { key, data: Buffer.from(bytes), size: bytes.length } });
}

export async function getFile(key: string): Promise<Buffer> {
  checkKey(key);
  const row = await getDb().storedFile.findUnique({ where: { key }, select: { data: true } });
  if (row) return Buffer.from(row.data);
  // Older documents saved on the PC's disk.
  if (process.env.VERCEL) throw new Error("File not found");
  const dir = process.env.DOCS_DIR || path.join(homedir(), ".nation-desk", "documents");
  return readFile(path.join(dir, key));
}

export async function deleteFile(key: string) {
  checkKey(key);
  await getDb().storedFile.deleteMany({ where: { key } });
}

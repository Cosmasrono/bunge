import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * File storage for uploaded and signed PDFs. Today this is a folder on the machine running the app
 * (outside the project, so dev reloads and OneDrive don't touch it). Online hosting such as Vercel has
 * no permanent disk, so this is the one module to swap for Vercel Blob / S3 / R2 later.
 */
const KEY_PATTERN = /^[a-f0-9]{32}\.pdf$/;

function dir() {
  if (process.env.VERCEL) {
    throw new Error("Document storage isn't set up for online hosting yet. Run the app on your own computer, or add cloud file storage.");
  }
  return process.env.DOCS_DIR || path.join(homedir(), ".nation-desk", "documents");
}

function pathFor(key: string) {
  if (!KEY_PATTERN.test(key)) throw new Error("Invalid file key");
  return path.join(dir(), key);
}

export function newFileKey() {
  return `${randomBytes(16).toString("hex")}.pdf`;
}

export async function putFile(key: string, bytes: Uint8Array) {
  const target = pathFor(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" }); // never overwrite an existing file
}

export async function getFile(key: string) {
  return readFile(pathFor(key));
}

export async function deleteFile(key: string) {
  await rm(pathFor(key), { force: true });
}

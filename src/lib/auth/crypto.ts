import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

/** argon2id with library defaults (memory-hard, salted). */
export function hashPassword(password: string) {
  return hash(password);
}

let dummyHash: Promise<string> | null = null;

/**
 * Checks a password. When there is no user we still run a real hash check,
 * so the response time doesn't reveal which emails have accounts.
 */
export async function checkPassword(storedHash: string | null | undefined, password: string) {
  if (!storedHash) {
    dummyHash ??= hash(randomBytes(16).toString("hex"));
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return verify(storedHash, password).catch(() => false);
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const COMMON = new Set([
  "password", "password1", "password123", "1234567890", "12345678910", "qwertyuiop",
  "iloveyou12", "letmein123", "welcome123", "admin12345", "passw0rd123", "qwerty12345",
  "1q2w3e4r5t", "abcdefghij", "0123456789",
]);

/** Returns a problem message, or null if the password is acceptable. */
export function passwordProblem(password: string, email = "") {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "That password is too long.";
  const low = password.toLowerCase();
  if (COMMON.has(low) || new Set(password).size < 4) {
    return "That password is too easy to guess. A short phrase you'll remember works well.";
  }
  if (email && low === email.toLowerCase()) return "Don't use your email address as your password.";
  return null;
}

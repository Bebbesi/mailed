import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

// OWASP recommended Argon2id parameters (19 MiB, 2 iterations, 1 lane).
// The library defaults to Argon2id; the const enum cannot be imported under isolatedModules.
const OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/** Runs a verification against a throwaway hash so unknown accounts take as long as known ones. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("mailed-timing-equaliser-not-a-real-password");
  await verifyPassword(await dummyHash, password);
}

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "123456789",
  "1234567890",
  "12345678910",
  "qwertyuiop",
  "iloveyou12",
  "letmein123",
  "welcome123",
  "administrator",
  "passw0rd123",
  "qwerty12345",
  "1q2w3e4r5t",
  "abcdef12345",
  "football123",
  "baseball123",
  "sunshine123",
  "princess123",
  "trustno1234",
]);

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use at most 128 characters.")
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), "This password is too common.")
  .refine((v) => new Set(v).size >= 5, "Use a less repetitive password.");

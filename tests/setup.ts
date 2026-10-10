import { rm } from "node:fs/promises";
import { afterAll, beforeEach, vi } from "vitest";
import { TEST_ENV } from "./env";

Object.assign(process.env, TEST_ENV);

// Route handlers read cookies/headers through next/headers; tests drive them
// with an in-memory cookie jar instead of a real Next.js request context.
vi.mock("next/headers", async () => {
  const { cookieJar } = await import("./helpers/cookies");
  return {
    cookies: async () => cookieJar,
    headers: async () => new Headers(),
  };
});

beforeEach(async () => {
  const { resetDatabase } = await import("./helpers/db");
  await resetDatabase();
  const { cookieJar } = await import("./helpers/cookies");
  cookieJar.clear();
});

afterAll(async () => {
  const { closeDb } = await import("@/lib/db");
  await closeDb();
  await rm(TEST_ENV.STORAGE_LOCAL_DIR, { recursive: true, force: true });
});

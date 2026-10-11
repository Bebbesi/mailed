import { env } from "../env";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";
import type { ObjectStorage } from "./shared";

export * from "./shared";

let instance: ObjectStorage | null = null;

export function storage(): ObjectStorage {
  if (instance) return instance;
  const e = env();
  instance = e.STORAGE_DRIVER === "s3" ? new S3Storage(e) : new LocalStorage(e.STORAGE_LOCAL_DIR, e.APP_SECRET);
  return instance;
}

/** Every key of a user lives under this prefix, so account deletion is one prefix delete. */
export function userPrefix(userId: string): string {
  if (!/^[\w-]+$/.test(userId)) throw new Error("Invalid user id for storage key");
  return `u/${userId}/`;
}

import os from "node:os";
import path from "node:path";

/** Environment shared by the global setup and every test worker. */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
  APP_SECRET: "test-secret-test-secret-test-secret-123456",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://mailed:mailed@localhost:5432/mailed_test",
  MAIL_DOMAINS: "mailed.test,alias.test",
  SYSTEM_MAIL_FROM: "Mailed <no-reply@mailed.test>",
  MAIL_OUTBOUND_DRIVER: "none",
  LOCAL_DELIVERY: "true",
  STORAGE_DRIVER: "local",
  STORAGE_LOCAL_DIR: path.join(os.tmpdir(), "mailed-test-storage"),
  LOG_LEVEL: "silent",
  INBOUND_WEBHOOK_SECRET: "webhook-test-secret",
  REDIS_URL: "",
  RSPAMD_URL: "",
  DNSBL_ENABLED: "false",
};

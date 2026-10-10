import pino from "pino";

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info");

/**
 * Structured JSON logger. Secrets and message content are redacted by path so
 * accidental inclusion in a log call does not leak them.
 */
export const logger = pino({
  level,
  base: { service: process.env.MAILED_SERVICE ?? "web" },
  redact: {
    paths: [
      "password",
      "*.password",
      "passwordHash",
      "*.passwordHash",
      "token",
      "*.token",
      "authorization",
      "*.authorization",
      "cookie",
      "*.cookie",
      "headers.cookie",
      "headers.authorization",
      "body",
      "*.body",
      "html",
      "*.html",
      "text",
      "*.text",
      "raw",
      "*.raw",
      "SMTP_PASSWORD",
      "IMAP_PASSWORD",
    ],
    censor: "[redacted]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;

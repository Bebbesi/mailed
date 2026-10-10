import { db } from "./db";
import { securityEvents } from "./db/schema";
import { logger } from "./logger";

export type SecurityEventType =
  | "register"
  | "login"
  | "login_failed"
  | "logout"
  | "password_changed"
  | "password_reset_requested"
  | "password_reset"
  | "email_verified"
  | "session_revoked"
  | "sessions_revoked"
  | "profile_updated"
  | "account_deleted"
  | "data_exported";

export async function recordSecurityEvent(
  type: SecurityEventType,
  data: { userId?: string | null; ip?: string | null; userAgent?: string | null; metadata?: Record<string, unknown> },
) {
  logger.info({ event: type, userId: data.userId ?? null, ip: data.ip ?? null }, "security event");
  if (type === "account_deleted") return;
  try {
    await db.insert(securityEvents).values({
      type,
      userId: data.userId ?? null,
      ip: data.ip ?? null,
      userAgent: data.userAgent ?? null,
      metadata: data.metadata ?? {},
    });
  } catch (err) {
    logger.error({ err, event: type }, "failed to persist security event");
  }
}

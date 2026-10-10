import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const TABLES = [
  "message_labels",
  "message_recipients",
  "attachments",
  "reminders",
  "notifications",
  "messages",
  "threads",
  "labels",
  "contacts",
  "sender_lists",
  "sender_categories",
  "email_rules",
  "classifier_tokens",
  "classifier_stats",
  "domain_reputation",
  "security_events",
  "auth_tokens",
  "sessions",
  "user_settings",
  "users",
  "rate_limits",
  "jobs",
  "imap_sync_state",
];

export async function resetDatabase() {
  await db.execute(sql.raw(`truncate table ${TABLES.map((t) => `"${t}"`).join(", ")} restart identity cascade`));
}

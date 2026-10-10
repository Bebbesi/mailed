CREATE TYPE "public"."auth_token_type" AS ENUM('verify_email', 'reset_password');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('primary', 'social', 'promotions', 'updates', 'forums', 'ads');--> statement-breakpoint
CREATE TYPE "public"."contact_source" AS ENUM('auto', 'manual', 'import');--> statement-breakpoint
CREATE TYPE "public"."density" AS ENUM('comfortable', 'compact');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."folder" AS ENUM('inbox', 'sent', 'drafts', 'archive', 'spam', 'trash');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('new_mail', 'reminder', 'send_failed', 'bounce', 'security', 'system');--> statement-breakpoint
CREATE TYPE "public"."reading_pane" AS ENUM('right', 'off');--> statement-breakpoint
CREATE TYPE "public"."recipient_kind" AS ENUM('to', 'cc', 'bcc');--> statement-breakpoint
CREATE TYPE "public"."remote_images" AS ENUM('ask', 'always');--> statement-breakpoint
CREATE TYPE "public"."rule_match" AS ENUM('all', 'any');--> statement-breakpoint
CREATE TYPE "public"."send_status" AS ENUM('draft', 'scheduled', 'queued', 'sending', 'sent', 'failed', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."sender_list_kind" AS ENUM('blocked', 'trusted');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('light', 'dark', 'system');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" uuid,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"content_id" text,
	"is_inline" boolean DEFAULT false NOT NULL,
	"is_dangerous" boolean DEFAULT false NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "auth_token_type" NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classifier_stats" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"spam_docs" integer DEFAULT 0 NOT NULL,
	"ham_docs" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classifier_tokens" (
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"spam_count" integer DEFAULT 0 NOT NULL,
	"ham_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "classifier_tokens_user_id_token_pk" PRIMARY KEY("user_id","token")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"address" text NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"interaction_count" integer DEFAULT 0 NOT NULL,
	"last_interaction_at" timestamp with time zone,
	"source" "contact_source" DEFAULT 'auto' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_reputation" (
	"domain" text PRIMARY KEY NOT NULL,
	"messages_seen" integer DEFAULT 0 NOT NULL,
	"spam_reports" integer DEFAULT 0 NOT NULL,
	"ham_reports" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"match" "rule_match" DEFAULT 'all' NOT NULL,
	"conditions" jsonb NOT NULL,
	"actions" jsonb NOT NULL,
	"stop_processing" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imap_sync_state" (
	"id" text PRIMARY KEY NOT NULL,
	"uid_validity" text,
	"last_uid" bigint DEFAULT 0 NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_error" text,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"unique_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_labels" (
	"message_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "message_labels_message_id_label_id_pk" PRIMARY KEY("message_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "message_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "recipient_kind" NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"address" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"direction" "direction" NOT NULL,
	"folder" "folder" NOT NULL,
	"restore_folder" "folder",
	"category" "category" DEFAULT 'primary' NOT NULL,
	"message_id_header" text,
	"in_reply_to" text,
	"references_header" text[] DEFAULT '{}'::text[] NOT NULL,
	"dedupe_key" text,
	"from_name" text DEFAULT '' NOT NULL,
	"from_address" text DEFAULT '' NOT NULL,
	"reply_to" text,
	"subject" text DEFAULT '' NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"text_body" text DEFAULT '' NOT NULL,
	"html_body" text,
	"has_remote_content" boolean DEFAULT false NOT NULL,
	"has_attachments" boolean DEFAULT false NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"raw_key" text,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"sort_date" timestamp with time zone DEFAULT now() NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_starred" boolean DEFAULT false NOT NULL,
	"is_important" boolean DEFAULT false NOT NULL,
	"snoozed_until" timestamp with time zone,
	"spam_score" real DEFAULT 0 NOT NULL,
	"is_suspicious" boolean DEFAULT false NOT NULL,
	"classification" jsonb,
	"security" jsonb,
	"list_id" text,
	"list_unsubscribe" text,
	"send_status" "send_status",
	"send_error" text,
	"send_attempts" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"trashed_at" timestamp with time zone,
	"draft_context" jsonb,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple'::regconfig, coalesce(subject, '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce(from_name, '') || ' ' || coalesce(from_address, '')), 'B') || setweight(to_tsvector('simple'::regconfig, left(coalesce(text_body, ''), 200000)), 'C')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"thread_id" uuid,
	"message_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"only_if_no_reply" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"type" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sender_categories" (
	"user_id" uuid NOT NULL,
	"pattern" text NOT NULL,
	"category" "category" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sender_categories_user_id_pattern_pk" PRIMARY KEY("user_id","pattern")
);
--> statement-breakpoint
CREATE TABLE "sender_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "sender_list_kind" NOT NULL,
	"pattern" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"theme" "theme" DEFAULT 'light' NOT NULL,
	"density" "density" DEFAULT 'comfortable' NOT NULL,
	"display_name" text,
	"signature_html" text DEFAULT '' NOT NULL,
	"locale" text DEFAULT 'en-US' NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"reading_pane" "reading_pane" DEFAULT 'right' NOT NULL,
	"mark_read_on_open" boolean DEFAULT true NOT NULL,
	"remote_images" "remote_images" DEFAULT 'ask' NOT NULL,
	"inbox_categories" boolean DEFAULT true NOT NULL,
	"undo_send_seconds" integer DEFAULT 5 NOT NULL,
	"page_size" integer DEFAULT 50 NOT NULL,
	"notify_in_app" boolean DEFAULT true NOT NULL,
	"notify_browser" boolean DEFAULT false NOT NULL,
	"muted_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"address" text NOT NULL,
	"recovery_email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password_hash" text NOT NULL,
	"password_changed_at" timestamp with time zone,
	"avatar_key" text,
	"quota_bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classifier_stats" ADD CONSTRAINT "classifier_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classifier_tokens" ADD CONSTRAINT "classifier_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_rules" ADD CONSTRAINT "email_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_labels" ADD CONSTRAINT "message_labels_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_labels" ADD CONSTRAINT "message_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_labels" ADD CONSTRAINT "message_labels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sender_categories" ADD CONSTRAINT "sender_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sender_lists" ADD CONSTRAINT "sender_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_message_idx" ON "attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "attachments_user_idx" ON "attachments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_type_idx" ON "auth_tokens" USING btree ("user_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_user_address_key" ON "contacts" USING btree ("user_id","address");--> statement-breakpoint
CREATE INDEX "email_rules_user_idx" ON "email_rules" USING btree ("user_id","position");--> statement-breakpoint
CREATE INDEX "jobs_pending_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_unique_key" ON "jobs" USING btree ("unique_key") WHERE "jobs"."status" in ('pending', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "labels_user_name_key" ON "labels" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "message_labels_label_idx" ON "message_labels" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "recipients_message_idx" ON "message_recipients" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "recipients_user_address_idx" ON "message_recipients" USING btree ("user_id","address");--> statement-breakpoint
CREATE INDEX "messages_user_folder_date_idx" ON "messages" USING btree ("user_id","folder","sort_date");--> statement-breakpoint
CREATE INDEX "messages_user_category_idx" ON "messages" USING btree ("user_id","category","folder","sort_date");--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "messages" USING btree ("thread_id","date");--> statement-breakpoint
CREATE INDEX "messages_user_msgid_idx" ON "messages" USING btree ("user_id","message_id_header");--> statement-breakpoint
CREATE INDEX "messages_user_from_idx" ON "messages" USING btree ("user_id","from_address");--> statement-breakpoint
CREATE INDEX "messages_starred_idx" ON "messages" USING btree ("user_id","sort_date") WHERE "messages"."is_starred";--> statement-breakpoint
CREATE INDEX "messages_unread_idx" ON "messages" USING btree ("user_id","folder") WHERE not "messages"."is_read";--> statement-breakpoint
CREATE INDEX "messages_snoozed_idx" ON "messages" USING btree ("snoozed_until") WHERE "messages"."snoozed_until" is not null;--> statement-breakpoint
CREATE INDEX "messages_trashed_idx" ON "messages" USING btree ("folder","trashed_at");--> statement-breakpoint
CREATE INDEX "messages_search_idx" ON "messages" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_user_dedupe_key" ON "messages" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("remind_at") WHERE "reminders"."fired_at" is null;--> statement-breakpoint
CREATE INDEX "reminders_user_idx" ON "reminders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "security_events_user_idx" ON "security_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sender_lists_user_pattern_key" ON "sender_lists" USING btree ("user_id","pattern");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "threads_user_last_idx" ON "threads" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_address_key" ON "users" USING btree ("address");--> statement-breakpoint
CREATE UNIQUE INDEX "users_recovery_email_key" ON "users" USING btree ("recovery_email");
CREATE TYPE "public"."linked_auth" AS ENUM('password', 'oauth_google', 'oauth_microsoft');--> statement-breakpoint
CREATE TYPE "public"."linked_provider" AS ENUM('gmail', 'outlook', 'yahoo', 'icloud', 'other');--> statement-breakpoint
CREATE TYPE "public"."linked_status" AS ENUM('active', 'error', 'auth_error');--> statement-breakpoint
CREATE TYPE "public"."server_security" AS ENUM('tls', 'starttls');--> statement-breakpoint
CREATE TABLE "linked_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "linked_provider" NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"auth_type" "linked_auth" NOT NULL,
	"username" text NOT NULL,
	"secret" text NOT NULL,
	"imap_host" text NOT NULL,
	"imap_port" integer NOT NULL,
	"imap_security" "server_security" NOT NULL,
	"smtp_host" text NOT NULL,
	"smtp_port" integer NOT NULL,
	"smtp_security" "server_security" NOT NULL,
	"label_id" uuid,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"send_enabled" boolean DEFAULT true NOT NULL,
	"status" "linked_status" DEFAULT 'active' NOT NULL,
	"uid_validity" text,
	"last_uid" bigint DEFAULT 0 NOT NULL,
	"backfill_done" boolean DEFAULT false NOT NULL,
	"next_sync_at" timestamp with time zone DEFAULT now(),
	"sync_locked_until" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "linked_account_id" uuid;--> statement-breakpoint
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "linked_accounts_user_email_key" ON "linked_accounts" USING btree ("user_id",lower("email"));--> statement-breakpoint
CREATE INDEX "linked_accounts_due_idx" ON "linked_accounts" USING btree ("next_sync_at");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_linked_account_id_linked_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."linked_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_linked_account_idx" ON "messages" USING btree ("linked_account_id") WHERE "messages"."linked_account_id" is not null;
import { z } from "zod";

const bool = (fallback: boolean) =>
  z
    .enum(["true", "false", "1", "0", "yes", "no", ""])
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : ["true", "1", "yes"].includes(v)));

const int = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : Number.parseInt(v, 10)))
    .pipe(z.number().int().nonnegative());

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
  TRUST_PROXY: bool(false),
  REGISTRATION_ENABLED: bool(true),

  MAIL_DOMAINS: z
    .string()
    .default("mailed.local")
    .transform((v) =>
      v
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
    ),
  SYSTEM_MAIL_FROM: optionalString,

  MAIL_OUTBOUND_DRIVER: z.enum(["none", "smtp"]).default("none"),
  SMTP_HOST: optionalString,
  SMTP_PORT: int(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_REQUIRE_TLS: bool(true),
  DKIM_DOMAIN: optionalString,
  DKIM_SELECTOR: optionalString,
  DKIM_PRIVATE_KEY: optionalString,
  LOCAL_DELIVERY: bool(true),

  INBOUND_SMTP_ENABLED: bool(false),
  INBOUND_SMTP_HOST: z.string().default("0.0.0.0"),
  INBOUND_SMTP_PORT: int(2525),
  INBOUND_SMTP_TLS_KEY_PATH: optionalString,
  INBOUND_SMTP_TLS_CERT_PATH: optionalString,
  INBOUND_SMTP_VERIFY_SENDER: bool(true),

  IMAP_ENABLED: bool(false),
  IMAP_HOST: optionalString,
  IMAP_PORT: int(993),
  IMAP_SECURE: bool(true),
  IMAP_USER: optionalString,
  IMAP_PASSWORD: optionalString,
  IMAP_MAILBOX: z.string().default("INBOX"),
  IMAP_POLL_INTERVAL_SECONDS: int(60),
  IMAP_PROCESSED_MAILBOX: optionalString,

  INBOUND_WEBHOOK_SECRET: optionalString,
  MAILGUN_WEBHOOK_SIGNING_KEY: optionalString,

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: optionalString,
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_FORCE_PATH_STYLE: bool(false),

  MAX_MESSAGE_SIZE_MB: int(25),
  DEFAULT_QUOTA_MB: int(5120),
  SEND_LIMIT_PER_HOUR: int(100),
  SEND_LIMIT_PER_DAY: int(500),
  TRASH_RETENTION_DAYS: int(30),
  SPAM_RETENTION_DAYS: int(30),

  REDIS_URL: optionalString,
  RSPAMD_URL: optionalString,
  RSPAMD_PASSWORD: optionalString,
  DNSBL_ENABLED: bool(false),
  DNSBL_DOMAIN_ZONES: z
    .string()
    .default("dbl.spamhaus.org")
    .transform((v) =>
      v
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/**
 * Validated configuration. Parsed lazily so that `next build` can analyse
 * route modules without a fully configured environment.
 */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const value = parsed.data;
  if (value.MAIL_DOMAINS.length === 0) {
    throw new Error("MAIL_DOMAINS must list at least one domain");
  }
  cached = value;
  return value;
}

export function primaryDomain(): string {
  return env().MAIL_DOMAINS[0];
}

export function isLocalDomain(domain: string): boolean {
  return env().MAIL_DOMAINS.includes(domain.toLowerCase());
}

export function outboundConfigured(): boolean {
  const e = env();
  return e.MAIL_OUTBOUND_DRIVER === "smtp" && Boolean(e.SMTP_HOST);
}

export function systemMailFrom(): string {
  return env().SYSTEM_MAIL_FROM ?? `Mailed <no-reply@${primaryDomain()}>`;
}

export function resetEnvCache() {
  cached = null;
}

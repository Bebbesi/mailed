import nodemailer from "nodemailer";
import { env, outboundConfigured } from "../env";
import { logger } from "../logger";

export type SendResult = {
  accepted: string[];
  rejected: string[];
  response?: string;
};

export class TransportError extends Error {
  constructor(
    message: string,
    public readonly permanent: boolean,
    public readonly responseCode?: number,
  ) {
    super(message);
    this.name = "TransportError";
  }
}

export interface OutboundTransport {
  readonly name: string;
  send(input: { envelope: { from: string; to: string[] }; raw: Buffer }): Promise<SendResult>;
  verify(): Promise<void>;
}

type NodemailerTransporter = ReturnType<typeof nodemailer.createTransport>;
export type SmtpOptions = Parameters<typeof nodemailer.createTransport>[0];

class SmtpTransport implements OutboundTransport {
  readonly name = "smtp";
  private transporter: NodemailerTransporter;

  constructor(options: SmtpOptions) {
    this.transporter = nodemailer.createTransport(options);
  }

  static fromEnv(): SmtpTransport {
    const e = env();
    return new SmtpTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      requireTLS: !e.SMTP_SECURE && e.SMTP_REQUIRE_TLS,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD ?? "" } : undefined,
      pool: true,
      maxConnections: 3,
      connectionTimeout: 20_000,
      greetingTimeout: 15_000,
      socketTimeout: 60_000,
      dkim:
        e.DKIM_DOMAIN && e.DKIM_SELECTOR && e.DKIM_PRIVATE_KEY
          ? {
              domainName: e.DKIM_DOMAIN,
              keySelector: e.DKIM_SELECTOR,
              privateKey: e.DKIM_PRIVATE_KEY.replace(/\\n/g, "\n"),
            }
          : undefined,
    });
  }

  close() {
    this.transporter.close();
  }

  async send(input: { envelope: { from: string; to: string[] }; raw: Buffer }): Promise<SendResult> {
    try {
      const info = await this.transporter.sendMail({ envelope: input.envelope, raw: input.raw });
      const accepted = ((info.accepted ?? []) as (string | { address: string })[]).map((a) => (typeof a === "string" ? a : a.address));
      const rejected = ((info.rejected ?? []) as (string | { address: string })[]).map((a) => (typeof a === "string" ? a : a.address));
      return { accepted, rejected, response: info.response };
    } catch (err) {
      const e = err as { responseCode?: number; code?: string; message?: string };
      const code = e.responseCode;
      const permanent = typeof code === "number" ? code >= 500 && code < 600 : e.code === "EENVELOPE" || e.code === "EMESSAGE";
      throw new TransportError(e.message ?? "SMTP delivery failed", permanent, code);
    }
  }

  async verify(): Promise<void> {
    await this.transporter.verify();
  }
}

let transport: OutboundTransport | null | undefined;

/** The configured outbound transport, or null when no provider is configured. */
export function getOutboundTransport(): OutboundTransport | null {
  if (transport !== undefined) return transport;
  if (!outboundConfigured()) {
    transport = null;
    return null;
  }
  transport = SmtpTransport.fromEnv();
  logger.info({ driver: transport.name, host: env().SMTP_HOST }, "outbound transport ready");
  return transport;
}

/** An SMTP transport with explicit settings (linked accounts). Call `close()` when done. */
export function createSmtpTransport(options: SmtpOptions): OutboundTransport & { close(): void } {
  return new SmtpTransport(options);
}

/** Test hook: replace the transport (e.g. with an in-memory fake). */
export function setOutboundTransport(t: OutboundTransport | null | undefined) {
  transport = t;
}

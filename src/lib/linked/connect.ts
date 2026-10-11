import { AuthenticationFailure, ImapFlow } from "imapflow";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { linkedAccounts, type LinkedAccount } from "../db/schema";
import { decryptSecret, encryptSecret } from "../crypto";
import { env } from "../env";
import { AppError } from "../errors";
import { createSmtpTransport, type OutboundTransport } from "../mail/transport";
import { resolveMailHost } from "./net";
import { OAuthError, refreshOAuthToken } from "./oauth";
import type { OAuthProviderId, ServerConfig } from "./providers";

export type LinkedAuth = { type: "password"; password: string } | { type: "oauth"; accessToken: string };

export type ConnectionSettings = {
  email: string;
  username: string;
  auth: LinkedAuth;
  imap: ServerConfig;
  smtp: ServerConfig;
};

export type FetchedMessage = { uid: number; source: Buffer; seen: boolean; internalDate: Date | null };

/** The INBOX of a linked account, opened and locked for one sync run. */
export interface LinkedMailbox {
  readonly uidValidity: string;
  readonly uidNext: number;
  /** UIDs of messages received on or after `since`, ascending. */
  searchSince(since: Date): Promise<number[]>;
  fetch(uids: number[] | { from: number }): AsyncIterable<FetchedMessage>;
  close(): Promise<void>;
}

export interface LinkedConnector {
  /** Logs in to IMAP and SMTP; throws LinkedAuthError for rejected credentials. */
  verify(settings: ConnectionSettings): Promise<void>;
  openInbox(settings: ConnectionSettings): Promise<LinkedMailbox>;
  transport(settings: ConnectionSettings): Promise<OutboundTransport & { close(): void }>;
}

/** Credentials were rejected: retrying won't help until the user fixes them. */
export class LinkedAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkedAuthError";
  }
}

const TIMEOUTS = { connectionTimeout: 20_000, greetingTimeout: 15_000, socketTimeout: 120_000 };

async function imapClient(s: ConnectionSettings): Promise<ImapFlow> {
  const ip = await resolveMailHost(s.imap.host);
  return new ImapFlow({
    host: ip,
    servername: s.imap.host,
    port: s.imap.port,
    secure: s.imap.security === "tls",
    doSTARTTLS: s.imap.security === "starttls" ? true : undefined,
    auth: s.auth.type === "password" ? { user: s.username, pass: s.auth.password } : { user: s.username, accessToken: s.auth.accessToken },
    logger: false,
    emitLogs: false,
    disableAutoIdle: true,
    ...TIMEOUTS,
  });
}

function isImapAuthFailure(err: unknown): boolean {
  return err instanceof AuthenticationFailure || Boolean((err as { authenticationFailed?: boolean })?.authenticationFailed);
}

async function imapLogin(s: ConnectionSettings): Promise<ImapFlow> {
  const client = await imapClient(s);
  client.on("error", () => undefined);
  try {
    await client.connect();
    return client;
  } catch (err) {
    client.close();
    if (isImapAuthFailure(err)) throw new LinkedAuthError("The email or password was rejected.");
    throw err;
  }
}

const imapConnector: LinkedConnector = {
  async verify(s) {
    const client = await imapLogin(s);
    await client.logout().catch(() => undefined);
    const transport = await this.transport(s);
    try {
      await transport.verify();
    } catch (err) {
      const e = err as { responseCode?: number; code?: string };
      if (e.code === "EAUTH" || e.responseCode === 535) throw new LinkedAuthError("The outgoing mail server rejected the email or password.");
      throw err;
    } finally {
      transport.close();
    }
  },

  async openInbox(s) {
    const client = await imapLogin(s);
    try {
      const lock = await client.getMailboxLock("INBOX");
      const mailbox = client.mailbox;
      if (!mailbox) throw new Error("INBOX could not be opened");
      return {
        uidValidity: String(mailbox.uidValidity),
        uidNext: Number(mailbox.uidNext ?? 1),
        async searchSince(since) {
          const uids = await client.search({ since }, { uid: true });
          return (uids || []).sort((a, b) => a - b);
        },
        async *fetch(range) {
          const set = Array.isArray(range) ? range.join(",") : `${range.from}:*`;
          if (Array.isArray(range) && range.length === 0) return;
          for await (const msg of client.fetch(set, { uid: true, source: true, flags: true, internalDate: true }, { uid: true })) {
            if (!msg.source) continue;
            const date = msg.internalDate ? new Date(msg.internalDate) : null;
            yield { uid: msg.uid, source: msg.source, seen: msg.flags?.has("\\Seen") ?? false, internalDate: date && !Number.isNaN(date.getTime()) ? date : null };
          }
        },
        async close() {
          lock.release();
          await client.logout().catch(() => client.close());
        },
      };
    } catch (err) {
      client.close();
      throw err;
    }
  },

  async transport(s) {
    const ip = await resolveMailHost(s.smtp.host);
    return createSmtpTransport({
      host: ip,
      port: s.smtp.port,
      secure: s.smtp.security === "tls",
      requireTLS: s.smtp.security === "starttls",
      tls: { servername: s.smtp.host },
      auth: s.auth.type === "password" ? { user: s.username, pass: s.auth.password } : { type: "OAuth2", user: s.username, accessToken: s.auth.accessToken },
      ...TIMEOUTS,
    });
  },
};

let connector: LinkedConnector = imapConnector;

export function linkedConnector(): LinkedConnector {
  return connector;
}

/** Test hook: replace IMAP/SMTP access with a fake. */
export function setLinkedConnector(c: LinkedConnector | null) {
  connector = c ?? imapConnector;
}

const accessTokens = new Map<string, { token: string; expiresAt: number }>();

function oauthProviderOf(a: LinkedAccount): OAuthProviderId | null {
  return a.authType === "oauth_google" ? "google" : a.authType === "oauth_microsoft" ? "microsoft" : null;
}

/** Decrypts the stored secret and, for OAuth accounts, returns a fresh access token. */
export async function connectionSettings(a: LinkedAccount): Promise<ConnectionSettings> {
  const secret = decryptSecret(env().APP_SECRET, a.secret);
  if (secret === null) throw new LinkedAuthError("Stored credentials can't be read (was APP_SECRET changed?). Reconnect the account.");
  const base = {
    email: a.email,
    username: a.username,
    imap: { host: a.imapHost, port: a.imapPort, security: a.imapSecurity },
    smtp: { host: a.smtpHost, port: a.smtpPort, security: a.smtpSecurity },
  };
  const provider = oauthProviderOf(a);
  if (!provider) return { ...base, auth: { type: "password", password: secret } };

  const cached = accessTokens.get(a.id);
  if (cached && cached.expiresAt > Date.now() + 60_000) return { ...base, auth: { type: "oauth", accessToken: cached.token } };
  try {
    const t = await refreshOAuthToken(provider, secret);
    accessTokens.set(a.id, { token: t.accessToken, expiresAt: t.expiresAt });
    if (t.refreshToken && t.refreshToken !== secret) {
      await db.update(linkedAccounts).set({ secret: encryptSecret(env().APP_SECRET, t.refreshToken), updatedAt: new Date() }).where(eq(linkedAccounts.id, a.id));
    }
    return { ...base, auth: { type: "oauth", accessToken: t.accessToken } };
  } catch (err) {
    if (err instanceof OAuthError && err.revoked) throw new LinkedAuthError("Access was revoked or expired. Sign in again to reconnect.");
    throw err;
  }
}

export function forgetAccessToken(accountId: string) {
  accessTokens.delete(accountId);
}

/** Turns connection failures into messages a person can act on. */
export function describeConnectionError(err: unknown, s: Pick<ConnectionSettings, "imap" | "smtp">): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof LinkedAuthError) {
    return new AppError(400, "auth_failed", `${err.message} If the provider uses 2-step verification, create an app password and use that instead.`);
  }
  const e = err as { code?: string; message?: string };
  const where = `${s.imap.host}:${s.imap.port} or ${s.smtp.host}:${s.smtp.port}`;
  if (e.code === "ENOTFOUND" || e.code === "EAI_AGAIN") return new AppError(400, "host_not_found", `Couldn't find the mail server (${where}).`);
  if (e.code === "ECONNREFUSED" || e.code === "ETIMEDOUT" || e.code === "ESOCKET" || e.code === "ECONNECTION" || e.code === "ETIMEOUT") {
    return new AppError(400, "connection_failed", `Couldn't connect to ${where}. Check the server names and ports.`);
  }
  if (/certificate|self[- ]signed|altnames/i.test(e.message ?? "")) {
    return new AppError(400, "tls_failed", "The server's security certificate isn't valid for its name.");
  }
  return new AppError(400, "connection_failed", `Couldn't sign in: ${(e.message ?? "unknown error").slice(0, 200)}`);
}

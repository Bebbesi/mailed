import { readFileSync } from "node:fs";
import os from "node:os";
import { authenticate } from "mailauth";
import { SMTPServer, type SMTPServerAddress, type SMTPServerDataStream, type SMTPServerSession } from "smtp-server";
import { env, isLocalDomain } from "@/lib/env";
import { logger } from "@/lib/logger";
import { hitRateLimit } from "@/lib/rate-limit";
import type { AuthResults } from "@/lib/mail/headers";
import { domainOf, normalizeAddress } from "@/lib/mail/address";
import { findLocalUsers, ingestRawMessage, IngestError } from "@/lib/mail/ingest";

function smtpError(message: string, code: number) {
  return Object.assign(new Error(message), { responseCode: code });
}

async function readStream(stream: SMTPServerDataStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function verifySender(raw: Buffer, session: SMTPServerSession): Promise<AuthResults | null> {
  try {
    const res = await authenticate(raw, {
      ip: session.remoteAddress,
      helo: session.hostNameAppearsAs,
      sender: session.envelope.mailFrom ? session.envelope.mailFrom.address : "",
      mta: os.hostname(),
      disableBimi: true,
    });
    const dkimResults = res.dkim?.results ?? [];
    const dkim = dkimResults.some((r) => r.status.result === "pass")
      ? "pass"
      : dkimResults.some((r) => r.status.result === "fail")
        ? "fail"
        : dkimResults.length
          ? dkimResults[0].status.result
          : "none";
    return {
      spf: res.spf ? res.spf.status.result : "none",
      dkim,
      dmarc: res.dmarc ? res.dmarc.status.result : "none",
      source: "mailed-smtp",
    };
  } catch (err) {
    logger.warn({ err }, "sender authentication failed to run");
    return null;
  }
}

/**
 * Built-in MX receiver. Accepts mail for hosted domains only, rejects unknown
 * mailboxes at RCPT time, and verifies SPF/DKIM/DMARC before storing.
 */
export function startSmtpServer() {
  const e = env();
  const maxBytes = e.MAX_MESSAGE_SIZE_MB * 1024 * 1024 * 1.4;
  const tls =
    e.INBOUND_SMTP_TLS_KEY_PATH && e.INBOUND_SMTP_TLS_CERT_PATH
      ? { key: readFileSync(e.INBOUND_SMTP_TLS_KEY_PATH), cert: readFileSync(e.INBOUND_SMTP_TLS_CERT_PATH) }
      : null;

  const server = new SMTPServer({
    name: os.hostname(),
    banner: "Mailed ESMTP",
    size: Math.floor(maxBytes),
    authOptional: true,
    disabledCommands: tls ? ["AUTH"] : ["AUTH", "STARTTLS"],
    ...(tls ?? {}),
    logger: false,
    maxClients: 100,
    socketTimeout: 60_000,
    closeTimeout: 30_000,

    async onConnect(session, callback) {
      const rl = await hitRateLimit(`smtp:conn:${session.remoteAddress}`, 600, 3600).catch(() => null);
      if (rl && !rl.allowed) return callback(smtpError("Too many connections, try again later", 421));
      callback();
    },

    async onMailFrom(address: SMTPServerAddress, session, callback) {
      const rl = await hitRateLimit(`smtp:msg:${session.remoteAddress}`, 300, 3600).catch(() => null);
      if (rl && !rl.allowed) return callback(smtpError("Too many messages, try again later", 451));
      callback();
    },

    async onRcptTo(address: SMTPServerAddress, session, callback) {
      const rcpt = normalizeAddress(address.address);
      if (!isLocalDomain(domainOf(rcpt))) return callback(smtpError("Relaying denied", 554));
      if (session.envelope.rcptTo.length >= 100) return callback(smtpError("Too many recipients", 452));
      try {
        const found = await findLocalUsers([rcpt]);
        if (found.length === 0) return callback(smtpError("No such user here", 550));
        callback();
      } catch (err) {
        logger.error({ err }, "recipient lookup failed");
        callback(smtpError("Temporary failure, try again later", 451));
      }
    },

    async onData(stream, session, callback) {
      try {
        const raw = await readStream(stream);
        if (stream.sizeExceeded) return callback(smtpError("Message exceeds fixed maximum message size", 552));
        const authResults = e.INBOUND_SMTP_VERIFY_SENDER ? await verifySender(raw, session) : null;
        const outcome = await ingestRawMessage(raw, {
          source: "smtp",
          envelope: {
            mailFrom: session.envelope.mailFrom ? session.envelope.mailFrom.address : null,
            rcptTo: session.envelope.rcptTo.map((r) => r.address),
            remoteIp: session.remoteAddress,
            helo: session.hostNameAppearsAs,
          },
          authResults,
        });
        if (outcome.delivered.length === 0) {
          const full = outcome.rejected.find((r) => r.reason === "Mailbox is full");
          return callback(full ? smtpError("Mailbox full", 552) : smtpError("No valid recipients", 550));
        }
        callback(null, "Message accepted");
      } catch (err) {
        if (err instanceof IngestError) {
          if (err.code === "too_large") return callback(smtpError("Message too large", 552));
          if (err.code === "no_recipients") return callback(smtpError("No valid recipients", 550));
          if (err.code === "unparseable") return callback(smtpError("Message could not be parsed", 554));
        }
        logger.error({ err }, "inbound SMTP delivery failed");
        callback(smtpError("Temporary local problem, please try again", 451));
      }
    },
  });

  server.on("error", (err) => logger.error({ err }, "smtp server error"));
  server.listen(e.INBOUND_SMTP_PORT, e.INBOUND_SMTP_HOST, () => {
    logger.info({ host: e.INBOUND_SMTP_HOST, port: e.INBOUND_SMTP_PORT, tls: Boolean(tls) }, "inbound SMTP server listening");
  });
  return server;
}

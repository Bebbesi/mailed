import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env, isLocalDomain, systemMailFrom } from "../env";
import { logger } from "../logger";
import { domainOf, parseAddressList } from "./address";
import { buildMime, newMessageId } from "./compose";
import { escapeHtml } from "./sanitize";
import { getOutboundTransport } from "./transport";

export type SystemMailResult = { delivered: boolean; via: "local" | "provider" | "dev-outbox" | "none"; error?: string };

function layout(title: string, paragraphs: string[], action: { label: string; url: string }, footer: string) {
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e4e4e7;border-radius:8px">
<tr><td style="padding:28px 32px 8px;font-size:15px;font-weight:600;letter-spacing:-0.01em">Mailed</td></tr>
<tr><td style="padding:8px 32px 0;font-size:20px;font-weight:600;letter-spacing:-0.02em">${escapeHtml(title)}</td></tr>
${paragraphs.map((p) => `<tr><td style="padding:12px 32px 0;font-size:14px;line-height:22px;color:#3f3f46">${escapeHtml(p)}</td></tr>`).join("")}
<tr><td style="padding:24px 32px 8px"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 16px;border-radius:6px">${escapeHtml(action.label)}</a></td></tr>
<tr><td style="padding:8px 32px 0;font-size:12px;line-height:18px;color:#71717a;word-break:break-all">${escapeHtml(action.url)}</td></tr>
<tr><td style="padding:24px 32px 28px;font-size:12px;line-height:18px;color:#71717a">${escapeHtml(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${title}\n\n${paragraphs.join("\n\n")}\n\n${action.label}: ${action.url}\n\n${footer}\n`;
  return { html, text };
}

async function deliver(to: string, subject: string, body: { html: string; text: string }, devLink: string): Promise<SystemMailResult> {
  const from = parseAddressList(systemMailFrom())[0] ?? { name: "Mailed", address: "no-reply@localhost" };
  const raw = await buildMime({
    from,
    to: [{ name: "", address: to }],
    subject,
    text: body.text,
    html: body.html,
    messageId: newMessageId(domainOf(from.address) || undefined),
    headers: { "Auto-Submitted": "auto-generated" },
  });

  if (isLocalDomain(domainOf(to)) && env().LOCAL_DELIVERY) {
    const { ingestRawMessage } = await import("./ingest");
    try {
      await ingestRawMessage(raw, { source: "local", envelope: { mailFrom: from.address, rcptTo: [to] } });
      return { delivered: true, via: "local" };
    } catch (err) {
      logger.error({ err }, "local delivery of system mail failed");
      return { delivered: false, via: "local", error: (err as Error).message };
    }
  }

  const transport = getOutboundTransport();
  if (transport) {
    try {
      await transport.send({ envelope: { from: from.address, to: [to] }, raw });
      return { delivered: true, via: "provider" };
    } catch (err) {
      logger.error({ err, to: domainOf(to) }, "system mail delivery failed");
      return { delivered: false, via: "provider", error: (err as Error).message };
    }
  }

  if (env().NODE_ENV !== "production") {
    // Development only: no provider configured, so keep the message on disk
    // and print the link to the server console.
    const dir = path.resolve(env().STORAGE_LOCAL_DIR, "dev-outbox");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${Date.now()}-${to.replace(/[^a-z0-9@.]/gi, "_")}.eml`);
    await writeFile(file, raw);
    logger.warn({ to, subject, file, link: devLink }, "outbound email provider not configured; system email written to dev outbox");
    return { delivered: false, via: "dev-outbox" };
  }

  logger.error({ subject }, "outbound email provider not configured; system email not sent");
  return { delivered: false, via: "none", error: "Email delivery is not configured" };
}

export async function sendVerificationEmail(to: string, firstName: string, token: string) {
  const url = `${env().APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const body = layout(
    "Confirm your recovery email",
    [
      `Hi ${firstName},`,
      "Confirm this address so you can recover your Mailed account if you ever lose access. The link expires in 48 hours.",
    ],
    { label: "Confirm email address", url },
    "If you did not create a Mailed account, you can ignore this message.",
  );
  return deliver(to, "Confirm your recovery email", body, url);
}

export async function sendPasswordResetEmail(to: string, firstName: string, token: string) {
  const url = `${env().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const body = layout(
    "Reset your password",
    [
      `Hi ${firstName},`,
      "We received a request to reset the password for your Mailed account. The link expires in 1 hour and can be used once.",
    ],
    { label: "Choose a new password", url },
    "If you did not request a password reset, ignore this message. Your password will not change.",
  );
  return deliver(to, "Reset your Mailed password", body, url);
}

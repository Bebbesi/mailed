import { randomUUID } from "node:crypto";
import MailComposer from "nodemailer/lib/mail-composer";
import { primaryDomain } from "../env";
import { formatAddress, type EmailAddress } from "./address";

export type ComposeInput = {
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress | null;
  subject: string;
  text: string;
  html?: string | null;
  messageId: string;
  inReplyTo?: string | null;
  references?: string[];
  date?: Date;
  attachments?: { filename: string; contentType: string; content: Buffer; contentId?: string | null; inline?: boolean }[];
  headers?: Record<string, string>;
};

export function newMessageId(domain = primaryDomain()): string {
  return `${randomUUID()}@${domain}`;
}

/**
 * Builds the RFC 5322 message. Bcc is never written to the headers; it only
 * appears in the SMTP envelope. File and URL access are disabled so content
 * can never pull in local files or remote resources.
 */
export async function buildMime(input: ComposeInput): Promise<Buffer> {
  const composer = new MailComposer({
    from: formatAddress(input.from),
    to: input.to.map(formatAddress),
    cc: input.cc?.length ? input.cc.map(formatAddress) : undefined,
    replyTo: input.replyTo ? formatAddress(input.replyTo) : undefined,
    subject: input.subject,
    text: input.text,
    html: input.html ?? undefined,
    messageId: `<${input.messageId}>`,
    inReplyTo: input.inReplyTo ? `<${input.inReplyTo}>` : undefined,
    references: input.references?.length ? input.references.map((r) => `<${r}>`).join(" ") : undefined,
    date: input.date ?? new Date(),
    attachments: (input.attachments ?? []).map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      content: a.content,
      cid: a.inline && a.contentId ? a.contentId : undefined,
      contentDisposition: a.inline ? "inline" : "attachment",
    })),
    headers: { "X-Mailer": "Mailed", ...(input.headers ?? {}) },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return composer.compile().build();
}

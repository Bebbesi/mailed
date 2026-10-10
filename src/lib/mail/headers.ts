import type { ParsedMail } from "mailparser";

export type HeaderMap = Record<string, string[]>;

/** All header occurrences keyed by lower-case name, values unfolded. */
export function headerMap(parsed: ParsedMail): HeaderMap {
  const out: HeaderMap = {};
  for (const { key, line } of parsed.headerLines ?? []) {
    const idx = line.indexOf(":");
    const value = (idx >= 0 ? line.slice(idx + 1) : "").replace(/\r?\n[ \t]+/g, " ").trim();
    const k = key.toLowerCase();
    (out[k] ??= []).push(value.slice(0, 4000));
  }
  return out;
}

export type AuthResults = { spf?: string; dkim?: string; dmarc?: string; source?: string };

const VERDICT = /^(pass|fail|softfail|neutral|none|temperror|permerror|policy|hardfail)$/i;

/**
 * Parses the top-most Authentication-Results header, which is the one added
 * by the receiving provider. Lower headers may be forged by the sender.
 */
export function parseAuthenticationResults(headers: HeaderMap): AuthResults | null {
  const top = headers["authentication-results"]?.[0];
  if (!top) return null;
  const pick = (method: string) => {
    const m = new RegExp(`\\b${method}\\s*=\\s*([a-z]+)`, "i").exec(top);
    if (!m || !VERDICT.test(m[1])) return undefined;
    const v = m[1].toLowerCase();
    return v === "hardfail" ? "fail" : v;
  };
  return { spf: pick("spf"), dkim: pick("dkim"), dmarc: pick("dmarc"), source: "header" };
}

export type DeliveryReport = {
  originalMessageId: string | null;
  failed: boolean;
  recipients: { address: string; action: string; status: string; diagnostic: string }[];
};

/** Extracts the essentials of an RFC 3464 delivery status notification. */
export function parseDeliveryReport(parsed: ParsedMail, headers: HeaderMap): DeliveryReport | null {
  const contentType = (headers["content-type"]?.[0] ?? "").toLowerCase();
  const statusPart = parsed.attachments.find((a) => a.contentType === "message/delivery-status" || a.contentType === "message/global-delivery-status");
  const isReport = contentType.includes("multipart/report") && contentType.includes("delivery-status");
  if (!statusPart && !isReport) return null;

  // mailparser may fold the delivery-status part into the text body.
  const statusText = statusPart?.content.toString("utf8") ?? parsed.text ?? "";
  const recipients: DeliveryReport["recipients"] = [];
  for (const block of statusText.split(/\r?\n\r?\n/)) {
    const field = (name: string) => new RegExp(`^${name}:\\s*(.+)$`, "im").exec(block)?.[1]?.trim() ?? "";
    const finalRcpt = field("Final-Recipient") || field("Original-Recipient");
    if (!finalRcpt) continue;
    recipients.push({
      address: finalRcpt.replace(/^rfc822;\s*/i, "").toLowerCase(),
      action: field("Action").toLowerCase(),
      status: field("Status"),
      diagnostic: field("Diagnostic-Code").replace(/^smtp;\s*/i, "").slice(0, 300),
    });
  }

  const originalPart = parsed.attachments.find((a) => a.contentType === "text/rfc822-headers" || a.contentType === "message/rfc822");
  const originalHeaders = originalPart?.content.toString("utf8").slice(0, 20000) ?? "";
  const idMatch = /^Message-ID:\s*<?([^>\s]+)>?/im.exec(originalHeaders);
  const originalMessageId =
    idMatch?.[1] ?? (typeof parsed.inReplyTo === "string" ? parsed.inReplyTo.replace(/[<>]/g, "") : null);

  return {
    originalMessageId,
    failed: recipients.length === 0 ? true : recipients.some((r) => r.action === "failed"),
    recipients,
  };
}

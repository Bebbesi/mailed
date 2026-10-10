import type { Category, MessageClassification, MessageSecurity, SpamReason } from "../db/schema";
import { domainOf, registrableDomain, type EmailAddress } from "../mail/address";
import { analyzeHtml, extractTextLinks } from "../mail/sanitize";
import { analyzeLinks, type LinkReport } from "./links";
import {
  AD_LABELS,
  AD_NETWORK_DOMAINS,
  ARCHIVE_EXTENSIONS,
  BRANDS,
  FORUM_DOMAINS,
  FORUM_HEADERS,
  FREE_MAIL_DOMAINS,
  HTML_EXTENSIONS,
  MACRO_EXTENSIONS,
  MARKETING_HEADERS,
  PHISHING_PHRASES,
  PROMO_PHRASES,
  SCAM_PHRASES,
  SOCIAL_DOMAINS,
  SOCIAL_PHRASES,
  UPDATE_DOMAINS,
  UPDATE_PHRASES,
  fileExtension,
  hasDoubleExtension,
  isDangerousFilename,
  scorePhrases,
} from "./signals";
import { tokenize } from "./bayes";

export const CLASSIFIER_VERSION = 1;
export const SPAM_THRESHOLD = 0.85;
const PRIOR_LOG_ODDS = -2.2;

export type ClassifierMessage = {
  fromName: string;
  fromAddress: string;
  replyTo: EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  recipientAddress: string;
  subject: string;
  text: string;
  /** Unsanitised HTML (analysed only, never rendered). */
  html: string | null;
  headers: Record<string, string[]>;
  attachments: { filename: string; contentType: string; size: number }[];
  auth: { spf?: string; dkim?: string; dmarc?: string };
  hasMessageId: boolean;
  dateHeader: Date | null;
  inReplyTo: string | null;
  references: string[];
  /** True when the message replies to something this user sent. */
  repliesToUser: boolean;
};

export type DomainReputation = {
  messagesSeen: number;
  spamReports: number;
  hamReports: number;
  firstSeenAt: Date;
};

export type ClassifierContext = {
  senderKnown: boolean;
  senderInteractions: number;
  senderList: "trusted" | "blocked" | null;
  senderCategory: Category | null;
  domainReputation: DomainReputation | null;
  bayes: { logOdds: number; used: number } | null;
  external?: { provider: string; score: number; action?: string } | null;
  dnsblHits?: string[];
  now?: Date;
};

export type ClassificationResult = {
  spamProbability: number;
  isSpam: boolean;
  category: Category;
  isSuspicious: boolean;
  isImportant: boolean;
  classification: MessageClassification;
  security: MessageSecurity;
};

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const header = (h: Record<string, string[]>, name: string) => h[name]?.[0] ?? "";
const hasHeader = (h: Record<string, string[]>, name: string) => (h[name]?.length ?? 0) > 0;

/** Features shared by the spam, phishing and category models. */
export function extractFeatures(msg: ClassifierMessage) {
  const htmlInfo = msg.html ? analyzeHtml(msg.html) : null;
  const links = analyzeLinks(htmlInfo ? htmlInfo.links : extractTextLinks(msg.text));
  const fromDomain = domainOf(msg.fromAddress);
  const fromReg = registrableDomain(fromDomain || "invalid");
  const bodyText = `${msg.subject}\n${msg.text}`.slice(0, 50_000);
  const listUnsubscribe = hasHeader(msg.headers, "list-unsubscribe");
  const listId = header(msg.headers, "list-id");
  const precedence = header(msg.headers, "precedence").toLowerCase();
  const autoSubmitted = header(msg.headers, "auto-submitted").toLowerCase();
  const marketingHeaders = MARKETING_HEADERS.filter((h) => hasHeader(msg.headers, h));
  const forumHeaders = FORUM_HEADERS.filter((h) => hasHeader(msg.headers, h));
  const recipients = [...msg.to, ...msg.cc];
  const directlyAddressed = recipients.some((r) => r.address === msg.recipientAddress);
  const noReplySender = /^(no-?reply|do-?not-?reply|noreply|notifications?|notify|alerts?|mailer|news(letter)?|info|marketing|updates?)([+.\-_]|@)/i.test(
    msg.fromAddress,
  );
  return {
    htmlInfo,
    links,
    fromDomain,
    fromReg,
    bodyText,
    listUnsubscribe,
    listId,
    precedence,
    autoSubmitted,
    marketingHeaders,
    forumHeaders,
    directlyAddressed,
    recipientCount: recipients.length,
    noReplySender,
  };
}

type Features = ReturnType<typeof extractFeatures>;

function brandImpersonation(fromName: string, fromReg: string): string | null {
  const name = fromName.toLowerCase();
  if (!name) return null;
  for (const [brand, domains] of Object.entries(BRANDS)) {
    const re = new RegExp(`(^|[^a-z])${brand.replace(/ /g, "\\s*")}([^a-z]|$)`, "i");
    if (re.test(name) && !domains.includes(fromReg)) return brand;
  }
  return null;
}

function scoreSecurity(msg: ClassifierMessage, f: Features, ctx: ClassifierContext) {
  const reasons: string[] = [];
  let score = 0;

  const brand = brandImpersonation(msg.fromName, f.fromReg);
  if (brand) {
    score += 2.5;
    reasons.push(`The sender name mentions ${brand} but the message comes from ${f.fromDomain}`);
  }
  const embedded = /[\w.+-]+@([\w-]+\.[\w.-]+)/.exec(msg.fromName);
  const spoofedDisplayName = Boolean(embedded && registrableDomain(embedded[1]) !== f.fromReg);
  if (spoofedDisplayName) {
    score += 2;
    reasons.push(`The display name shows ${embedded![0]} but the real address is ${msg.fromAddress}`);
  }
  const replyToMismatch = msg.replyTo.some((r) => registrableDomain(domainOf(r.address)) !== f.fromReg);
  if (replyToMismatch && (brand || FREE_MAIL_DOMAINS.has(registrableDomain(domainOf(msg.replyTo[0].address))))) {
    score += 1;
    reasons.push("Replies would go to a different, unrelated address");
  }
  if (f.links.mismatchedLinks > 0) {
    score += 1.8;
    reasons.push("Some links show one address but open another");
  }
  if (f.links.ipLinks > 0) {
    score += 1;
    reasons.push("Links point to raw IP addresses");
  }
  const phishingText = scorePhrases(f.bodyText, PHISHING_PHRASES, 2.4);
  if (phishingText.score > 0 && f.links.total > 0) {
    score += phishingText.score;
    reasons.push("Asks you to act urgently on your account or credentials");
  }
  if (f.htmlInfo && f.htmlInfo.forms > 0) {
    score += 1;
    reasons.push("Contains an embedded form");
  }
  const dangerousAttachments = msg.attachments.filter((a) => isDangerousFilename(a.filename)).map((a) => a.filename);
  const htmlAttachments = msg.attachments.filter((a) => HTML_EXTENSIONS.has(fileExtension(a.filename)));
  if (htmlAttachments.length > 0) {
    score += 1.5;
    reasons.push("Includes a web page as an attachment, a common phishing technique");
  }
  if (msg.auth.dmarc === "fail") {
    score += 1.5;
    reasons.push("The sender's domain did not authenticate this message (DMARC failed)");
  }

  const trusted = ctx.senderList === "trusted";
  const phishing = !trusted && score >= 3;
  const unknownSender = !ctx.senderKnown && !trusted;

  const security: MessageSecurity = {
    phishing,
    phishingReasons: phishing ? reasons : [],
    unknownSender,
    spoofedDisplayName,
    replyToMismatch,
    suspiciousLinks: f.links.findings.map((l) => ({ href: l.href, text: l.text, reasons: l.reasons })),
    dangerousAttachments,
    auth: { ...msg.auth },
  };
  return { security, phishingScore: score };
}

function scoreSpam(msg: ClassifierMessage, f: Features, ctx: ClassifierContext, phishingScore: number) {
  const reasons: SpamReason[] = [];
  let logit = PRIOR_LOG_ODDS;
  const add = (code: string, label: string, weight: number) => {
    if (weight === 0) return;
    logit += weight;
    reasons.push({ code, label, weight: Math.round(weight * 100) / 100 });
  };

  // Authentication results.
  if (msg.auth.spf === "fail") add("spf_fail", "SPF check failed", 1.5);
  else if (msg.auth.spf === "softfail") add("spf_softfail", "SPF soft-failed", 0.6);
  if (msg.auth.dkim === "fail") add("dkim_fail", "DKIM signature invalid", 1.2);
  if (msg.auth.dmarc === "fail") add("dmarc_fail", "DMARC policy failed", 2.2);
  if (msg.auth.dkim === "pass" && msg.auth.dmarc === "pass") add("auth_pass", "Sender authenticated (DKIM and DMARC)", -1.0);
  else if (msg.auth.spf === "pass" && msg.auth.dkim === "pass") add("auth_pass_partial", "Sender authenticated (SPF and DKIM)", -0.6);
  else if (!msg.auth.spf && !msg.auth.dkim && !msg.auth.dmarc) add("auth_none", "No authentication results", 0.3);

  // Relationship with the sender.
  if (ctx.senderKnown) add("known_sender", "You have corresponded with this sender", -2.5);
  if (msg.repliesToUser) add("reply_to_user", "Reply to a message you sent", -2.0);

  // Phishing signals (already weighted).
  if (phishingScore > 0) add("phishing", "Phishing indicators", Math.min(phishingScore, 5) * 0.8);

  // Content.
  const scam = scorePhrases(f.bodyText, SCAM_PHRASES, 3.5);
  if (scam.score > 0) add("scam_language", `Language common in scams (${scam.hits.slice(0, 2).join(", ")})`, scam.score);
  const letters = msg.subject.replace(/[^\p{L}]/gu, "");
  if (letters.length > 10 && letters.replace(/[^\p{Lu}]/gu, "").length / letters.length > 0.7) {
    add("subject_caps", "Subject written in capitals", 0.6);
  }
  if (/[!?]{3,}|\${2,}|€{2,}/.test(msg.subject)) add("subject_punct", "Excessive punctuation in subject", 0.4);
  if (/^\s*(re|r|aw|sv)\s*:/i.test(msg.subject) && !msg.inReplyTo && msg.references.length === 0) {
    add("fake_reply", "Looks like a reply but isn't part of a conversation", 0.6);
  }
  if (f.htmlInfo) {
    if (f.htmlInfo.images > 0 && msg.text.replace(/\s+/g, "").length < 80) add("image_only", "Mostly images with little text", 0.8);
    if (f.htmlInfo.hiddenText) add("hidden_text", "Contains hidden text", 0.5);
  }

  // Links.
  if (f.links.shortenerLinks > 0) add("shortener", "Uses link shorteners", 0.4);
  if (f.links.punycodeLinks > 0) add("punycode", "Links to look-alike international domains", 0.8);
  if (f.links.domains.length > 10) add("many_domains", "Links to many different sites", 0.3);
  if (ctx.dnsblHits && ctx.dnsblHits.length > 0) {
    add("dnsbl", `Links to domains on a blocklist (${ctx.dnsblHits.slice(0, 2).join(", ")})`, Math.min(4, 2.5 * ctx.dnsblHits.length));
  }

  // Attachments.
  for (const a of msg.attachments) {
    const ext = fileExtension(a.filename);
    if (hasDoubleExtension(a.filename)) add("double_ext", `Disguised file name (${a.filename})`, 2.0);
    else if (isDangerousFilename(a.filename)) add("dangerous_attachment", `Executable attachment (${a.filename})`, 3.0);
    else if (MACRO_EXTENSIONS.has(ext)) add("macro_attachment", `Macro-enabled document (${a.filename})`, 1.2);
    else if (ARCHIVE_EXTENSIONS.has(ext) && !ctx.senderKnown) add("archive_attachment", "Compressed attachment from a new sender", 0.6);
  }

  // Headers and structure.
  if (!msg.hasMessageId) add("no_message_id", "Missing Message-ID header", 0.5);
  if (!msg.dateHeader) add("no_date", "Missing Date header", 0.3);
  else if (msg.dateHeader.getTime() - (ctx.now ?? new Date()).getTime() > 48 * 3600 * 1000) add("future_date", "Dated in the future", 0.5);
  if (f.precedence === "bulk" && !f.listUnsubscribe) add("bulk_no_unsub", "Bulk mail without an unsubscribe option", 0.8);
  if (f.listUnsubscribe) add("list_unsubscribe", "Provides an unsubscribe option", -0.3);
  if (!f.directlyAddressed && !ctx.senderKnown && f.recipientCount === 0) add("undisclosed", "Sent to undisclosed recipients", 0.6);
  else if (!f.directlyAddressed && !ctx.senderKnown && !f.listId) add("bcc", "You were not a visible recipient", 0.3);

  // Domain reputation (aggregate across the installation).
  const rep = ctx.domainReputation;
  if (rep) {
    const ageMs = (ctx.now ?? new Date()).getTime() - rep.firstSeenAt.getTime();
    if (ageMs < 24 * 3600 * 1000 && rep.messagesSeen < 3 && !ctx.senderKnown) add("new_domain", "Sender domain recently seen for the first time", 0.4);
    const reports = rep.spamReports + rep.hamReports;
    if (reports >= 3) {
      const ratio = (rep.spamReports + 1) / (reports + 2);
      const w = Math.max(-1.5, Math.min(2.5, 1.2 * Math.log(ratio / (1 - ratio))));
      if (Math.abs(w) >= 0.2) add("domain_reputation", w > 0 ? "Sender domain often reported as spam" : "Sender domain has a good reputation", w);
    }
  }

  // The user's own corrections.
  if (ctx.bayes) {
    const w = Math.max(-3, Math.min(3, ctx.bayes.logOdds));
    if (Math.abs(w) >= 0.2) add("personal_model", w > 0 ? "Similar to messages you marked as spam" : "Similar to messages you marked as not spam", w);
  }

  // Optional external filter.
  if (ctx.external) {
    const action = ctx.external.action ?? "";
    const w =
      action === "reject" ? 3 : action === "add header" || action === "rewrite subject" ? 1.5 : action === "greylist" ? 0.3 : action === "no action" ? -0.4 : 0;
    if (w !== 0) add("external_filter", `${ctx.external.provider} verdict: ${action}`, w);
  }

  let probability = sigmoid(logit);
  let source: MessageClassification["spam"]["source"] = "model";
  if (ctx.senderList === "trusted") {
    probability = Math.min(probability, 0.01);
    source = "list";
    reasons.push({ code: "trusted", label: "Sender is on your trusted list", weight: -10 });
  } else if (ctx.senderList === "blocked") {
    probability = Math.max(probability, 0.99);
    source = "list";
    reasons.push({ code: "blocked", label: "Sender is on your blocked list", weight: 10 });
  }

  reasons.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  return { probability, reasons: reasons.slice(0, 12), source };
}

function scoreCategory(msg: ClassifierMessage, f: Features, ctx: ClassifierContext) {
  const scores: Record<Category, number> = { primary: 1.0, social: 0, promotions: 0, updates: 0, forums: 0, ads: 0 };
  const reasons: Record<Category, string[]> = { primary: [], social: [], promotions: [], updates: [], forums: [], ads: [] };
  const add = (c: Category, w: number, reason: string) => {
    scores[c] += w;
    if (w > 0) reasons[c].push(reason);
  };

  // Primary
  if (ctx.senderKnown) add("primary", 2.5, "You have corresponded with this sender");
  if (msg.repliesToUser) add("primary", 2.5, "Reply to your message");
  if (f.directlyAddressed && f.recipientCount <= 5 && !f.listUnsubscribe && !f.noReplySender && f.marketingHeaders.length === 0) {
    add("primary", 1.0, "Sent directly to you");
  }
  if (domainOf(msg.recipientAddress) === f.fromDomain) add("primary", 1.0, "From your own organisation");
  if (FREE_MAIL_DOMAINS.has(f.fromReg) && !f.listUnsubscribe) add("primary", 0.8, "Personal email account");

  // Social
  if (SOCIAL_DOMAINS.has(f.fromReg)) add("social", 4, `Notification from ${f.fromReg}`);
  const social = scorePhrases(msg.subject, SOCIAL_PHRASES, 2);
  if (social.score > 0) add("social", social.score * 1.5, "Social activity notification");

  // Forums
  // A List-Id alone is common in newsletters; discussion lists also carry List-Post.
  if (f.listId && f.marketingHeaders.length === 0) add("forums", f.forumHeaders.length > 0 ? 1.5 : 0.8, "Mailing list message");
  if (f.forumHeaders.length > 0) add("forums", 2, "Discussion group headers");
  if (FORUM_DOMAINS.has(f.fromReg)) add("forums", 2, "Group or forum service");
  if (f.precedence === "list") add("forums", 0.8, "Precedence: list");
  if (/^\s*(re:\s*)?\[[^\]]{2,40}\]/i.test(msg.subject) && f.listId) add("forums", 0.8, "List tag in subject");

  // Promotions
  if (f.listUnsubscribe) add("promotions", 1.2, "Has an unsubscribe link");
  if (f.precedence === "bulk") add("promotions", 0.8, "Sent in bulk");
  if (f.marketingHeaders.length > 0) add("promotions", 1.8, "Sent by a marketing platform");
  const promo = scorePhrases(f.bodyText, PROMO_PHRASES, 2.2);
  if (promo.score > 0) add("promotions", promo.score, "Offers or marketing language");
  if (/unsubscribe|annulla l'iscrizione|disiscriviti|cancella iscrizione/i.test(msg.text)) add("promotions", 0.6, "Mentions unsubscribing");
  if (f.htmlInfo && f.htmlInfo.images >= 4) add("promotions", 0.4, "Image-rich layout");

  // Updates
  const upd = scorePhrases(f.bodyText.slice(0, 5000), UPDATE_PHRASES, 2.6);
  if (upd.score > 0) add("updates", upd.score, "Receipt, confirmation or account notice");
  if (f.autoSubmitted && f.autoSubmitted !== "no") add("updates", 1.0, "Automatically generated");
  if (f.noReplySender) add("updates", 0.7, "Sent from a no-reply address");
  if (UPDATE_DOMAINS.has(f.fromReg) && !f.marketingHeaders.length) add("updates", 1.2, `Service notification from ${f.fromReg}`);
  if (msg.attachments.some((a) => /invoice|receipt|fattura|ricevuta/i.test(a.filename))) add("updates", 0.8, "Invoice or receipt attached");

  // Ads: only with explicit advertising signals, never for ordinary newsletters.
  const adLabel = scorePhrases(msg.subject, AD_LABELS, 3);
  const adBody = scorePhrases(msg.text.slice(0, 3000), AD_LABELS.slice(2), 1.2);
  if (adLabel.score > 0) add("ads", adLabel.score + 0.8, "Labelled as advertising");
  if (adBody.score > 0) add("ads", adBody.score, "Declares sponsored content");
  const adNetworks = f.links.domains.filter((d) => AD_NETWORK_DOMAINS.has(d));
  if (adNetworks.length > 0) add("ads", Math.min(2, adNetworks.length), `Ad-network links (${adNetworks.slice(0, 2).join(", ")})`);
  if (scores.ads > 0 && !ctx.senderKnown && (ctx.domainReputation?.messagesSeen ?? 0) < 3) add("ads", 0.5, "Unsolicited sender");

  // Ads must clearly beat Promotions and pass an absolute bar.
  if (scores.ads < 3 || scores.ads < scores.promotions + 0.5) {
    scores.ads = Math.min(scores.ads, scores.promotions - 0.01, 2.99);
  }

  const entries = Object.entries(scores) as [Category, number][];
  const max = Math.max(...entries.map(([, s]) => s));
  const exps = entries.map(([c, s]) => [c, Math.exp(s - max)] as const);
  const total = exps.reduce((a, [, e]) => a + e, 0);
  const probs = Object.fromEntries(exps.map(([c, e]) => [c, Math.round((e / total) * 1000) / 1000])) as Record<Category, number>;
  let category = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
  let source: MessageClassification["category"]["source"] = "model";
  if (ctx.senderCategory) {
    category = ctx.senderCategory;
    source = "user";
  }
  return {
    category,
    scores: probs,
    reasons: source === "user" ? ["You moved messages from this sender here"] : reasons[category].slice(0, 5),
    source,
  };
}

/** Pure scoring step: deterministic given the message and context. */
export function scoreMessage(msg: ClassifierMessage, ctx: ClassifierContext): ClassificationResult {
  const f = extractFeatures(msg);
  const { security, phishingScore } = scoreSecurity(msg, f, ctx);
  const spam = scoreSpam(msg, f, ctx, phishingScore);
  const category = scoreCategory(msg, f, ctx);
  const isSpam = spam.probability >= SPAM_THRESHOLD;
  const isImportant =
    !isSpam &&
    category.category === "primary" &&
    (msg.repliesToUser || (ctx.senderKnown && ctx.senderInteractions >= 2 && f.directlyAddressed));

  return {
    spamProbability: Math.round(spam.probability * 1000) / 1000,
    isSpam,
    category: category.category,
    isSuspicious: security.phishing || security.dangerousAttachments.length > 0,
    isImportant,
    security,
    classification: {
      version: CLASSIFIER_VERSION,
      spam: { probability: Math.round(spam.probability * 1000) / 1000, reasons: spam.reasons, source: spam.source },
      category: { value: category.category, scores: category.scores, reasons: category.reasons, source: category.source },
      external: ctx.external ?? null,
    },
  };
}

export function bayesTokensFor(msg: ClassifierMessage, links?: LinkReport): string[] {
  const f = links ? null : extractFeatures(msg);
  const flags: string[] = [];
  if (hasHeader(msg.headers, "list-unsubscribe")) flags.push("list-unsub");
  if (msg.attachments.length > 0) flags.push("attachments");
  if (msg.html) flags.push("html");
  if (msg.auth.dmarc) flags.push(`dmarc-${msg.auth.dmarc}`);
  return tokenize({
    subject: msg.subject,
    text: msg.text,
    fromAddress: msg.fromAddress,
    linkDomains: (links ?? f!.links).domains,
    flags,
  });
}

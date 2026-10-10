import { describe, expect, it } from "vitest";
import { scoreMessage, SPAM_THRESHOLD, type ClassifierContext, type ClassifierMessage } from "@/lib/classify";
import { analyzeLinks } from "@/lib/classify/links";
import { tokenize } from "@/lib/classify/bayes";

function msg(over: Partial<ClassifierMessage> = {}): ClassifierMessage {
  return {
    fromName: "Giulia Ferri",
    fromAddress: "giulia@studio-ferri.example",
    replyTo: [],
    to: [{ name: "", address: "alice@mailed.test" }],
    cc: [],
    recipientAddress: "alice@mailed.test",
    subject: "Planning notes",
    text: "Hi Alice, here are the notes from today.",
    html: null,
    headers: {},
    attachments: [],
    auth: { spf: "pass", dkim: "pass", dmarc: "pass" },
    hasMessageId: true,
    dateHeader: new Date(),
    inReplyTo: null,
    references: [],
    repliesToUser: false,
    ...over,
  };
}

const ctx = (over: Partial<ClassifierContext> = {}): ClassifierContext => ({
  senderKnown: false,
  senderInteractions: 0,
  senderList: null,
  senderCategory: null,
  domainReputation: null,
  bayes: null,
  ...over,
});

describe("spam scoring", () => {
  it("keeps an ordinary authenticated personal message out of spam", () => {
    const r = scoreMessage(msg(), ctx());
    expect(r.isSpam).toBe(false);
    expect(r.category).toBe("primary");
    expect(r.spamProbability).toBeLessThan(0.2);
  });

  it("detects brand impersonation with a mismatched link as phishing", () => {
    const r = scoreMessage(
      msg({
        fromName: "PayPal Security",
        fromAddress: "alert@paypa1-verify.example",
        subject: "Your account has been suspended",
        html: '<p>Verify your account within 24 hours.</p><a href="http://192.0.2.10/login">https://www.paypal.com/signin</a>',
        text: "Verify your account within 24 hours. https://www.paypal.com/signin",
        auth: {},
      }),
      ctx(),
    );
    expect(r.security.phishing).toBe(true);
    expect(r.isSuspicious).toBe(true);
    expect(r.isSpam).toBe(true);
    expect(r.security.suspiciousLinks.length).toBeGreaterThan(0);
    expect(r.classification.spam.reasons.some((x) => x.code === "phishing")).toBe(true);
  });

  it("does not rely on keywords alone: a known sender mentioning a prize stays in the inbox", () => {
    const r = scoreMessage(msg({ text: "We won the lottery of parking spots — you have won the corner desk!" }), ctx({ senderKnown: true, senderInteractions: 5 }));
    expect(r.isSpam).toBe(false);
  });

  it("flags advance-fee scams from unknown, unauthenticated senders", () => {
    const r = scoreMessage(
      msg({
        fromName: "Claims Office",
        fromAddress: "claims@prize-desk.example",
        subject: "CONGRATULATIONS!!! YOU HAVE WON",
        text: "You have won the lottery jackpot. Send the processing fee by wire transfer via Western Union to claim your prize.",
        auth: {},
      }),
      ctx(),
    );
    expect(r.spamProbability).toBeGreaterThanOrEqual(SPAM_THRESHOLD);
  });

  it("honours the trusted and blocked lists over the model", () => {
    const scam = msg({ subject: "YOU HAVE WON!!!", text: "lottery jackpot wire transfer processing fee", auth: {} });
    expect(scoreMessage(scam, ctx({ senderList: "trusted" })).isSpam).toBe(false);
    expect(scoreMessage(msg(), ctx({ senderList: "blocked" })).isSpam).toBe(true);
  });

  it("uses the personal model when it has learned from corrections", () => {
    const base = msg({ auth: {} });
    const neutral = scoreMessage(base, ctx()).spamProbability;
    const learned = scoreMessage(base, ctx({ bayes: { logOdds: 3, used: 20 } })).spamProbability;
    expect(learned).toBeGreaterThan(neutral);
  });

  it("blocks dangerous attachments", () => {
    const r = scoreMessage(msg({ attachments: [{ filename: "invoice.pdf.exe", contentType: "application/octet-stream", size: 1000 }] }), ctx());
    expect(r.security.dangerousAttachments).toEqual(["invoice.pdf.exe"]);
    expect(r.isSuspicious).toBe(true);
  });
});

describe("category scoring", () => {
  it("files marketing newsletters under Promotions, not Ads", () => {
    const r = scoreMessage(
      msg({
        fromName: "Lumen Outfitters",
        fromAddress: "offers@lumen.example",
        subject: "Autumn sale: 30% off",
        text: "30% off all outerwear. Shop now. Unsubscribe.",
        headers: { "list-unsubscribe": ["<https://lumen.example/u>"], "x-campaign": ["autumn"] },
      }),
      ctx(),
    );
    expect(r.category).toBe("promotions");
  });

  it("uses Ads only with explicit advertising signals", () => {
    const r = scoreMessage(
      msg({
        fromAddress: "promo@brightline.example",
        subject: "[ADV] Win a weekend away",
        text: "Sponsored content. Messaggio pubblicitario.",
        html: '<p>Sponsored</p><a href="https://ad.doubleclick.net/clk">Learn more</a>',
        headers: { "list-unsubscribe": ["<https://brightline.example/u>"] },
      }),
      ctx(),
    );
    expect(r.category).toBe("ads");
  });

  it("recognises discussion lists as Forums and newsletters with List-Id as Promotions", () => {
    const forum = scoreMessage(
      msg({
        subject: "[maps] Proposal for footpaths",
        headers: { "list-id": ["<maps.lists.example>"], "list-post": ["<mailto:maps@lists.example>"], precedence: ["list"] },
      }),
      ctx(),
    );
    expect(forum.category).toBe("forums");
    const newsletter = scoreMessage(
      msg({
        subject: "Issue 214",
        text: "This week in design. Unsubscribe any time.",
        headers: { "list-id": ["<weekly.example>"], "list-unsubscribe": ["<https://x.example/u>"], precedence: ["bulk"] },
      }),
      ctx(),
    );
    expect(newsletter.category).toBe("promotions");
  });

  it("recognises social notifications and transactional updates", () => {
    expect(scoreMessage(msg({ fromAddress: "notify@facebookmail.com", subject: "Davide mentioned you in a comment" }), ctx()).category).toBe("social");
    expect(
      scoreMessage(msg({ fromAddress: "no-reply@shop.example", subject: "Your order #123 has shipped", text: "Tracking number: 1Z999. Receipt attached." }), ctx()).category,
    ).toBe("updates");
  });

  it("applies a learned sender category", () => {
    const r = scoreMessage(msg(), ctx({ senderCategory: "updates" }));
    expect(r.category).toBe("updates");
    expect(r.classification.category.source).toBe("user");
  });
});

describe("link analysis", () => {
  it("flags IP hosts, credentials in URLs, punycode and mismatched anchors", () => {
    const report = analyzeLinks([
      { href: "http://192.0.2.1/x", text: "click" },
      { href: "https://user@evil.example/login", text: "login" },
      { href: "https://xn--pple-43d.com/", text: "apple" },
      { href: "https://evil.example/", text: "www.mybank.com" },
      { href: "mailto:a@b.example", text: "mail" },
    ]);
    expect(report.ipLinks).toBe(1);
    expect(report.punycodeLinks).toBe(1);
    expect(report.mismatchedLinks).toBe(1);
    expect(report.total).toBe(4);
    expect(report.findings.length).toBe(4);
  });
});

describe("tokenizer", () => {
  it("produces prefixed, unique tokens", () => {
    const t = tokenize({ subject: "Hello hello", text: "Body text body", fromAddress: "A@B.example", linkDomains: ["x.example"], flags: ["html"] });
    expect(t).toContain("s:hello");
    expect(t).toContain("body");
    expect(t).toContain("f:a@b.example");
    expect(t).toContain("fd:b.example");
    expect(t).toContain("ld:x.example");
    expect(new Set(t).size).toBe(t.length);
  });
});

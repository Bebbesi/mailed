import { describe, expect, it, vi } from "vitest";
import { signToken, verifySignedToken } from "@/lib/crypto";
import { cleanMessageId, parseAddressList, parseReferences, registrableDomain } from "@/lib/mail/address";
import { canonicalMailbox } from "@/lib/mail/ingest";
import { evaluateRules } from "@/lib/mail/rules";
import { normalizeSubject, replySubject } from "@/lib/mail/subject";
import { isDangerousFilename } from "@/lib/classify/signals";
import type { EmailRule } from "@/lib/db/schema";

describe("signed tokens", () => {
  it("round-trips, rejects tampering and expires", () => {
    const t = signToken("secret-secret-secret-secret-secret!!", "payload", 60);
    expect(verifySignedToken("secret-secret-secret-secret-secret!!", t)).toBe("payload");
    expect(verifySignedToken("another-secret-another-secret-12345", t)).toBeNull();
    const [p, e, s] = t.split(".");
    expect(verifySignedToken("secret-secret-secret-secret-secret!!", `${Buffer.from("other").toString("base64url")}.${e}.${s}`)).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 120_000);
    expect(verifySignedToken("secret-secret-secret-secret-secret!!", `${p}.${e}.${s}`)).toBeNull();
    vi.useRealTimers();
  });
});

describe("addresses", () => {
  it("parses lists and groups", () => {
    expect(parseAddressList('"Rossi, Alice" <Alice@Example.org>, bob@example.org, Team: carol@x.example;')).toEqual([
      { name: "Rossi, Alice", address: "alice@example.org" },
      { name: "", address: "bob@example.org" },
      { name: "", address: "carol@x.example" },
    ]);
  });
  it("normalises message ids and references", () => {
    expect(cleanMessageId(" <abc@x> ")).toBe("abc@x");
    expect(parseReferences("<a@x> <b@y>")).toEqual(["a@x", "b@y"]);
  });
  it("maps plus-addressing to the mailbox", () => {
    expect(canonicalMailbox("alice+news@mailed.test")).toBe("alice@mailed.test");
  });
  it("computes registrable domains", () => {
    expect(registrableDomain("mail.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("x@a.b.example.com")).toBe("example.com");
  });
});

describe("subjects", () => {
  it("strips reply and forward prefixes in several languages", () => {
    expect(normalizeSubject("Re: RE: Fwd: Hello")).toBe("Hello");
    expect(normalizeSubject("R: I: Ciao")).toBe("Ciao");
    expect(replySubject("Re: Hello")).toBe("Re: Hello");
  });
});

describe("dangerous file names", () => {
  it("catches executables and double extensions", () => {
    expect(isDangerousFilename("setup.exe")).toBe(true);
    expect(isDangerousFilename("invoice.pdf.js")).toBe(true);
    expect(isDangerousFilename("report.pdf")).toBe(false);
  });
});

describe("filter rules", () => {
  const rule = (over: Partial<EmailRule>): EmailRule =>
    ({
      id: "r1",
      userId: "u",
      name: "r",
      enabled: true,
      match: "all",
      conditions: [],
      actions: [],
      stopProcessing: false,
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    }) as EmailRule;
  const facts = { from: "Billing billing@acme.example", to: "alice@mailed.test", subject: "Invoice 42", body: "Amount due", hasAttachment: true, listId: "" };

  it("matches all/any conditions and collects actions in order", () => {
    const r1 = rule({ id: "a", conditions: [{ field: "from", op: "ends_with", value: "acme.example" }, { field: "subject", op: "contains", value: "invoice" }], actions: [{ type: "mark_read" }] });
    const r2 = rule({ id: "b", position: 1, match: "any", conditions: [{ field: "body", op: "contains", value: "nope" }, { field: "has_attachment", op: "is_true", value: "true" }], actions: [{ type: "star" }] });
    expect(evaluateRules([r2, r1], facts)).toEqual({ actions: [{ type: "mark_read" }, { type: "star" }], matched: ["a", "b"] });
  });

  it("respects disabled rules and stopProcessing", () => {
    const r1 = rule({ id: "a", stopProcessing: true, conditions: [{ field: "subject", op: "contains", value: "invoice" }], actions: [{ type: "archive" }] });
    const r2 = rule({ id: "b", position: 1, conditions: [{ field: "subject", op: "contains", value: "invoice" }], actions: [{ type: "star" }] });
    const r3 = rule({ id: "c", enabled: false, conditions: [{ field: "subject", op: "contains", value: "invoice" }], actions: [{ type: "trash" }] });
    expect(evaluateRules([r1, r2, r3], facts).matched).toEqual(["a"]);
  });
});

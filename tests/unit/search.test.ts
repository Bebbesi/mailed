import { describe, expect, it } from "vitest";
import { isEmptySearch, parseSearch, tsLexemes } from "@/lib/search/parse";

describe("search parser", () => {
  it("parses operators, phrases and exclusions", () => {
    const q = parseSearch('from:giulia to:"Marco B" subject:invoice has:attachment is:unread in:archive label:Clients "quarterly report" budget -draft');
    expect(q.from).toEqual(["giulia"]);
    expect(q.to).toEqual(["marco b"]);
    expect(q.subject).toEqual(["invoice"]);
    expect(q.hasAttachment).toBe(true);
    expect([...q.is]).toEqual(["unread"]);
    expect(q.in).toBe("archive");
    expect(q.labels).toEqual(["Clients"]);
    expect(q.phrases).toEqual(["quarterly report"]);
    expect(q.terms).toEqual(["budget"]);
    expect(q.excluded).toEqual(["draft"]);
  });

  it("parses dates, relative dates and sizes", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const q = parseSearch("after:2026/01/31 before:2026-03-01 larger:2M smaller:500K", now);
    expect(q.after?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(q.before?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(q.larger).toBe(2 * 1024 * 1024);
    expect(q.smaller).toBe(500 * 1024);
    const r = parseSearch("newer_than:7d", now);
    expect(r.after?.toISOString()).toBe("2026-06-08T12:00:00.000Z");
  });

  it("ignores unknown operators values safely", () => {
    const q = parseSearch("in:nowhere category:bogus is:weird");
    expect(q.in).toBeNull();
    expect(q.category).toBeNull();
    expect(q.is.size).toBe(0);
  });

  it("only produces safe tsquery lexemes", () => {
    expect(tsLexemes("drop table'); -- héllo & | !")).toEqual(["drop", "table", "héllo"]);
  });

  it("detects empty searches", () => {
    expect(isEmptySearch(parseSearch("   "))).toBe(true);
    expect(isEmptySearch(parseSearch("is:starred"))).toBe(false);
  });
});

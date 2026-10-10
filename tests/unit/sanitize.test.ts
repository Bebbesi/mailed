import { describe, expect, it } from "vitest";
import { analyzeHtml, makeSnippet, sanitizeCss, sanitizeEmailHtml } from "@/lib/mail/sanitize";

describe("HTML sanitiser", () => {
  it("removes scripts, event handlers and dangerous URLs", () => {
    const out = sanitizeEmailHtml(
      '<p onclick="alert(1)">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><img src="x" onerror="alert(1)"><iframe src="https://evil.example"></iframe><form action="https://evil.example"><input name="pw"></form><svg><script>1</script></svg>',
    );
    expect(out).not.toMatch(/script|onclick|onerror|javascript:|iframe|<form|<input|<svg/i);
    expect(out).toContain("Hi");
  });

  it("keeps formatting and forces links to open safely", () => {
    const out = sanitizeEmailHtml('<table><tr><td style="color:#333;padding:4px">Cell</td></tr></table><a href="https://example.com">Link</a>');
    expect(out).toContain("<table>");
    expect(out).toContain('style="color:#333;padding:4px"');
    expect(out).toMatch(/<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer nofollow">/);
  });

  it("drops non-image data URIs and unsafe CSS", () => {
    expect(sanitizeEmailHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">')).not.toContain("data:text/html");
    expect(sanitizeEmailHtml('<p style="position:fixed;behavior:url(x)">x</p>')).not.toMatch(/position|behavior/);
    expect(sanitizeCss("@import url(https://x/a.css); body{background:expression(alert(1))}")).not.toMatch(/@import|expression\(/);
  });

  it("collects links and remote resources for analysis", () => {
    const a = analyzeHtml('<a href="https://evil.example">www.bank.com</a><img src="https://tracker.example/p.gif"><div style="display:none">hidden</div><form></form>');
    expect(a.links).toEqual([{ href: "https://evil.example", text: "www.bank.com" }]);
    expect(a.remoteResources).toBe(1);
    expect(a.hiddenText).toBe(true);
    expect(a.forms).toBe(1);
  });

  it("builds snippets without quoted replies", () => {
    expect(makeSnippet("Sounds good!\n\nOn Mon, Alice wrote:\n> earlier text")).toBe("Sounds good!");
  });
});

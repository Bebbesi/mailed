import { describe, expect, it } from "vitest";
import { analyzeHtml, makeSnippet, referencesRemoteContent, sanitizeCss, sanitizeEmailHtml } from "@/lib/mail/sanitize";

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

  it("keeps newsletter style sheets from <head> and filters them", () => {
    const out = sanitizeEmailHtml(
      '<html><head><title>Secret title</title><meta charset="utf-8"><link rel="stylesheet" href="https://x.example/a.css"><style>@import url(https://x.example/b.css); body{background:#f4f4f7} .cta > a{color:#fff !important} @media (max-width:600px){.c{width:100% !important}} .x{position:fixed;width:expression(alert(1))}</style></head><body><p class="c">Hi</p></body></html>',
    );
    expect(out).not.toMatch(/Secret title|<meta|<link|@import|expression\(|position:\s*fixed/i);
    expect(out).toContain(".mailed-body{background:#f4f4f7}");
    expect(out).toContain(".cta > a{color:#fff !important}");
    expect(out).toContain("@media (max-width:600px){.c{width:100% !important}}");
  });

  it("turns <body> attributes into styles on its replacement", () => {
    const out = sanitizeEmailHtml('<body bgcolor="#f4f4f7" text="#222" background="https://cdn.example/bg.png" style="margin:0"><p>x</p></body>');
    expect(out).toMatch(/^<div class="mailed-body" style="background-color:#f4f4f7;color:#222;background-image:url\(&quot;https:\/\/cdn\.example\/bg\.png&quot;\);margin:0">/);
    const hostile = sanitizeEmailHtml('<body bgcolor="red;position:fixed" background="javascript:alert(1)"><p>x</p></body>');
    expect(hostile).toMatch(/^<div class="mailed-body">/);
    expect(hostile).not.toMatch(/fixed|javascript/);
  });

  it("keeps the markup and CSS newsletters rely on", () => {
    const out = sanitizeEmailHtml(
      '<table id="main" role="presentation" background="https://cdn.example/bg.png"><tr><td background="javascript:alert(1)" style="background-image:url(https://cdn.example/hero.png);background-size:cover;border-top-left-radius:8px;box-shadow:0 1px 2px #ccc;position:absolute;z-index:2">x</td></tr></table><button style="padding:12px">Open</button><p style="position:fixed;z-index:calc(1)">y</p>',
    );
    expect(out).toContain('id="main"');
    expect(out).toContain('background="https://cdn.example/bg.png"');
    expect(out).not.toContain("javascript");
    expect(out).toContain("background-image:url(https://cdn.example/hero.png);background-size:cover;border-top-left-radius:8px;box-shadow:0 1px 2px #ccc;position:absolute;z-index:2");
    expect(out).toContain('<button style="padding:12px">Open</button>');
    expect(out).toContain("<p>y</p>");
  });

  it("removes NUL characters, which the database can't store", () => {
    const nul = String.fromCharCode(0);
    expect(sanitizeEmailHtml(`<style>.foo${nul} { width: 41px }</style><p>a${nul}b</p>`)).not.toContain(nul);
  });

  it("detects remote images in attributes and styles", () => {
    expect(referencesRemoteContent('<table background="https://cdn.example/bg.png"></table>')).toBe(true);
    expect(referencesRemoteContent('<td style="background-image:url(https://cdn.example/x.png)"></td>')).toBe(true);
    expect(referencesRemoteContent('<img src="cid:logo">')).toBe(false);
  });

  it("builds snippets without quoted replies", () => {
    expect(makeSnippet("Sounds good!\n\nOn Mon, Alice wrote:\n> earlier text")).toBe("Sounds good!");
  });
});

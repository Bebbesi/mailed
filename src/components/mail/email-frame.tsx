"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const BASE_CSS = `
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--mailed-font, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  font-size: 14px; color: #18181b; overflow-wrap: break-word;
}
pre { white-space: pre-wrap; }
a { color: #1d4ed8; }
blockquote[type="cite"], .mailed-quote blockquote { margin: 0.5em 0 0.5em 0.4em; padding-left: 0.8em; border-left: 2px solid #d4d4d8; color: #52525b; }
`;

// Messages written as text (personal mail, replies): comfortable reading, sized to the pane.
const SIMPLE_CSS = `
:root { color-scheme: light; }
body { line-height: 1.6; }
img, video { max-width: 100%; height: auto; }
table { max-width: 100%; }
`;

// Designed mail (newsletters, receipts) renders as authored on white, and is scaled down when wider than the pane.
const DESIGNED_CSS = `
:root { color-scheme: light; background: #ffffff; }
body { line-height: normal; }
img:not([width]) { max-width: 100%; height: auto; }
`;

const DARK_CSS = `
:root { color-scheme: dark; }
body { color: #e4e4e7; }
a { color: #7aa2f7; }
blockquote[type="cite"], .mailed-quote blockquote { border-left-color: #3f3f46; color: #a1a1aa; }
`;

/** Layout tables, style sheets or explicit colours mean the sender designed the message's look. */
const DESIGNED = /<(table|style)\b|\sbgcolor=|background(-color|-image)?\s*:|[\s;"']color\s*:|<font\b[^>]*\scolor=/i;

export function isDesignedEmail(html: string): boolean {
  return DESIGNED.test(html);
}

/** The document loaded into the sandboxed frame. */
export function frameDocument(html: string, opts: { allowRemote: boolean; dark: boolean }): string {
  const imgSrc = opts.allowRemote ? "'self' data: blob: https:" : "'self' data: blob:";
  const csp = `default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; font-src data:; media-src 'none'; form-action 'none'; base-uri 'none'`;
  // Designed mail keeps its own colours (it assumes a light background); plain messages follow the theme.
  const css = BASE_CSS + (isDesignedEmail(html) ? DESIGNED_CSS : SIMPLE_CSS + (opts.dark ? DARK_CSS : ""));
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><base target="_blank"><style>${css}</style></head><body>${html}</body></html>`;
}

const MIN_SCALE = 0.5;

export type FrameLinkHandler = (href: string, e: MouseEvent) => void;

/**
 * Renders sanitised message HTML in a sandboxed iframe: no scripts, no forms,
 * no top navigation. A CSP inside the frame blocks every remote load unless
 * the reader allowed remote images for this message.
 */
export function EmailFrame({
  html,
  allowRemote,
  dark,
  onLinkClick,
  title = "Message content",
}: {
  html: string;
  allowRemote: boolean;
  dark: boolean;
  onLinkClick?: FrameLinkHandler;
  title?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const designed = useMemo(() => isDesignedEmail(html), [html]);

  const srcDoc = useMemo(() => frameDocument(html, { allowRemote, dark }), [html, allowRemote, dark]);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let observer: ResizeObserver | null = null;
    let lastScale = 1;

    // Scales fixed-width layouts (typically 600–700px tables or cards) down to
    // the pane instead of squeezing them, which breaks their columns. Responsive
    // mail adapts through its own media queries first and never needs this.
    const measure = () => {
      const doc = frame.contentDocument;
      const body = doc?.body;
      if (!doc || !body) return;
      const available = frame.clientWidth;
      if (lastScale !== 1) body.style.width = "";
      const natural = body.scrollWidth;
      const scale = available > 0 && natural > available + 1 ? Math.max(MIN_SCALE, available / natural) : 1;
      lastScale = scale;
      body.style.transformOrigin = "0 0";
      body.style.transform = scale < 1 ? `scale(${scale})` : "";
      body.style.width = scale < 1 ? `${natural}px` : "";
      doc.documentElement.style.overflowX = scale < 1 && natural * scale > available + 1 ? "auto" : scale < 1 ? "hidden" : "";
      const contentHeight = scale < 1 ? body.scrollHeight : doc.documentElement.scrollHeight;
      setHeight(Math.min(Math.max(Math.ceil(contentHeight * scale), 40), 100_000));
    };

    const onLoad = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      measure();
      observer?.disconnect();
      observer = new ResizeObserver(() => measure());
      observer.observe(doc.body);
      observer.observe(frame);
      doc.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure, { once: true }));
      doc.addEventListener("click", (e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (!a) return;
        const href = a.getAttribute("href") ?? "";
        if (!/^(https?:|mailto:|tel:)/i.test(href)) {
          e.preventDefault();
          return;
        }
        if (onLinkClick) onLinkClick(href, e);
      });
    };
    frame.addEventListener("load", onLoad);
    if (frame.contentDocument?.URL === "about:srcdoc" && frame.contentDocument.readyState === "complete") onLoad();
    return () => {
      frame.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, [srcDoc, onLinkClick]);

  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      className={cn("block w-full border-0 bg-transparent", designed && dark && "rounded-md")}
      style={{ height }}
    />
  );
}

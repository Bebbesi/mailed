"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const BASE_CSS = `
:root { color-scheme: light; }
html, body { margin: 0; padding: 0; }
body {
  font: 14px/1.6 var(--mailed-font, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
  color: #18181b; background: transparent; overflow-wrap: anywhere; word-break: break-word;
}
img, video { max-width: 100%; height: auto; }
table { max-width: 100%; }
pre { white-space: pre-wrap; }
a { color: #1d4ed8; }
blockquote[type="cite"], .mailed-quote blockquote { margin: 0.5em 0 0.5em 0.4em; padding-left: 0.8em; border-left: 2px solid #d4d4d8; color: #52525b; }
`;

const DARK_CSS = `
:root { color-scheme: dark; }
body { color: #e4e4e7; }
a { color: #7aa2f7; }
blockquote[type="cite"], .mailed-quote blockquote { border-left-color: #3f3f46; color: #a1a1aa; }
`;

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

  const srcDoc = useMemo(() => {
    const imgSrc = allowRemote ? "'self' data: blob: https:" : "'self' data: blob:";
    const csp = `default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; font-src data:; media-src 'none'; form-action 'none'; base-uri 'none'`;
    // Mail designed for light backgrounds stays readable: only plain messages get dark colours.
    const looksStyled = /bgcolor|background(-color)?\s*:/i.test(html);
    const darkCss = dark && !looksStyled ? DARK_CSS : "";
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><base target="_blank"><style>${BASE_CSS}${darkCss}</style></head><body>${html}</body></html>`;
  }, [html, allowRemote, dark]);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let observer: ResizeObserver | null = null;
    const onLoad = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      const measure = () => setHeight(Math.min(Math.max(doc.documentElement.scrollHeight, 40), 100_000));
      measure();
      observer = new ResizeObserver(measure);
      observer.observe(doc.body);
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
      className="block w-full border-0 bg-transparent"
      style={{ height }}
    />
  );
}

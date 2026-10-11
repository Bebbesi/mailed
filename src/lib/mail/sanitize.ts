import { Parser } from "htmlparser2";
import sanitizeHtml from "sanitize-html";
import { convert } from "html-to-text";

export type ExtractedLink = { href: string; text: string };

export type HtmlAnalysis = {
  links: ExtractedLink[];
  remoteResources: number;
  images: number;
  hiddenText: boolean;
  forms: number;
};

const ALLOWED_TAGS = [
  "a", "abbr", "acronym", "address", "b", "bdi", "bdo", "big", "blockquote", "br", "button", "caption", "center",
  "cite", "code", "col", "colgroup", "dd", "del", "details", "dfn", "div", "dl", "dt", "em", "font", "h1", "h2",
  "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd", "label", "li", "mark", "nobr", "ol", "p", "pre", "q",
  "s", "samp", "small", "span", "strike", "strong", "style", "sub", "summary", "sup", "table", "tbody", "td",
  "tfoot", "th", "thead", "time", "tr", "tt", "u", "ul", "var", "wbr", "section", "article", "aside", "header",
  "footer", "main", "nav", "figure", "figcaption", "picture", "source",
];

// Ids and classes only reach elements inside the sandboxed frame, where no script runs.
const GLOBAL_ATTRS = [
  "style", "class", "id", "align", "valign", "dir", "lang", "title", "width", "height", "bgcolor", "border",
  "role", "aria-label", "aria-hidden",
];

/** Class given to the message's <body>, which becomes a <div> (style blocks are rewritten to match). */
export const BODY_CLASS = "mailed-body";
const SAFE_URL = /^https?:\/\/[^\s"'()<>\\]+$/i;

const CSS_VALUE = /^[^<>{}\\]*$/;
const SAFE_CSS_PROPS = [
  "color", "background-color", "background", "font", "font-family", "font-size", "font-style", "font-weight",
  "line-height", "letter-spacing", "text-align", "text-decoration", "text-transform", "text-indent",
  "vertical-align", "white-space", "word-break", "word-wrap", "overflow-wrap", "direction",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "border", "border-top", "border-right", "border-bottom", "border-left", "border-color", "border-style",
  "border-width", "border-radius", "border-collapse", "border-spacing",
  "width", "min-width", "max-width", "height", "min-height", "max-height",
  "display", "list-style", "list-style-type", "table-layout", "opacity", "float", "clear", "overflow",
  "mso-line-height-rule", "mso-table-lspace", "mso-table-rspace", "-webkit-text-size-adjust", "-ms-text-size-adjust",
  // Backgrounds, borders and effects used by newsletters
  "background-image", "background-position", "background-repeat", "background-size", "background-clip", "background-origin",
  "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
  "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
  "box-shadow", "text-shadow", "text-overflow", "font-variant", "font-stretch", "visibility", "box-sizing", "outline",
  "cursor", "word-spacing", "hyphens", "object-fit", "object-position", "aspect-ratio", "list-style-position",
  "caption-side", "empty-cells", "overflow-x", "overflow-y",
  // Flexbox (modern templates)
  "flex", "flex-direction", "flex-wrap", "flex-flow", "flex-grow", "flex-shrink", "flex-basis",
  "justify-content", "align-items", "align-self", "align-content", "gap", "row-gap", "column-gap", "order",
  "top", "right", "bottom", "left",
];

const allowedStyles: Record<string, RegExp[]> = {
  ...Object.fromEntries(SAFE_CSS_PROPS.map((p) => [p, [CSS_VALUE]])),
  // Fixed/sticky could pin content over the reader; the frame contains everything else.
  position: [/^(static|relative|absolute)$/i],
  "z-index": [/^-?\d{1,4}$/],
};

/** Points CSS written for <body> at the element that replaces it. */
function retargetBodySelectors(css: string): string {
  return css.replace(/([^{}]+)\{/g, (_m, prelude: string) => `${prelude.replace(/(^|[\s,>+~(])body(?=$|[\s,.:#[>+~)])/gi, `$1.${BODY_CLASS}`)}{`);
}

/** <body bgcolor text background style> → styles on the replacement <div>. */
function bodyAttributes(attribs: Record<string, string>): Record<string, string> {
  const decl: string[] = [];
  const color = /^#?[\w(),.%\s-]{1,40}$/;
  if (attribs.bgcolor && color.test(attribs.bgcolor)) decl.push(`background-color:${attribs.bgcolor}`);
  if (attribs.text && color.test(attribs.text)) decl.push(`color:${attribs.text}`);
  if (attribs.background && SAFE_URL.test(attribs.background)) decl.push(`background-image:url("${attribs.background}")`);
  if (attribs.style) decl.push(attribs.style);
  const out: Record<string, string> = { class: [BODY_CLASS, attribs.class].filter(Boolean).join(" ") };
  if (decl.length) out.style = decl.join(";");
  if (attribs.dir) out.dir = attribs.dir;
  return out;
}

/** Neutralises dangerous constructs inside <style> blocks and style attributes. */
export function sanitizeCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/expression\s*\(/gi, "invalid(")
    .replace(/behavior\s*:/gi, "invalid:")
    .replace(/-moz-binding\s*:/gi, "invalid:")
    .replace(/javascript\s*:/gi, "invalid:")
    .replace(/position\s*:\s*(fixed|sticky)/gi, "position: static")
    .replace(/<\/?\s*style/gi, "");
}

function sanitizeStyleBlock(css: string): string {
  return retargetBodySelectors(sanitizeCss(css));
}

/**
 * Sanitises untrusted email HTML. The result is still rendered inside a
 * sandboxed iframe with a restrictive CSP, so this is defence in depth.
 */
export function sanitizeEmailHtml(html: string): string {
  // sanitize-html copies <style> contents verbatim (textFilter never sees them),
  // so the CSS is filtered here, on exactly the text the browser will parse.
  // NUL characters (seen in Outlook CSS hacks) can't be stored in PostgreSQL text.
  return sanitizeMarkup(html.replace(/\u0000/g, ""))
    .replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, css: string, close: string) => `${open}${sanitizeStyleBlock(css)}${close}`);
}

function sanitizeMarkup(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowVulnerableTags: true, // <style> is allowed; its contents are filtered below.
    allowedAttributes: {
      "*": GLOBAL_ATTRS,
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height", "srcset", "hspace", "vspace"],
      source: ["srcset", "media", "type"],
      td: ["colspan", "rowspan", "nowrap", "background"],
      th: ["colspan", "rowspan", "scope", "background"],
      tr: ["background"],
      table: ["cellpadding", "cellspacing", "summary", "background", "frame", "rules"],
      font: ["color", "face", "size"],
      hr: ["noshade", "size", "color"],
      time: ["datetime"],
      details: ["open"],
      col: ["span"],
      colgroup: ["span"],
      ol: ["start", "type"],
      blockquote: ["cite", "type"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "cid", "data"], source: ["http", "https"] },
    allowedSchemesAppliedToAttributes: ["href", "src", "cite", "background"],
    allowProtocolRelative: false,
    allowedStyles: { "*": allowedStyles },
    parseStyleAttributes: true,
    // <head> is kept so its <style> blocks survive; its other children are dropped or have no text.
    nonTextTags: ["script", "textarea", "option", "noscript", "title", "template", "iframe", "object", "embed", "svg", "math", "xml"],
    transformTags: {
      body: (_tagName, attribs) => ({ tagName: "div", attribs: bodyAttributes(attribs) }),
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        return {
          tagName,
          attribs: {
            ...attribs,
            href,
            target: "_blank",
            rel: "noopener noreferrer nofollow",
          },
        };
      },
      img: (tagName, attribs) => {
        const src = attribs.src ?? "";
        if (src.startsWith("data:") && !/^data:image\/(png|gif|jpe?g|webp);base64,/i.test(src)) {
          return { tagName, attribs: { ...attribs, src: "" } };
        }
        return { tagName, attribs };
      },
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  });
}

/** True when sanitised HTML would load images or backgrounds from the internet. */
export function referencesRemoteContent(safeHtml: string): boolean {
  return /<img[^>]+src=["']?https?:|url\(\s*['"]?https?:|srcset=["'][^"']*https?:|\sbackground=["']?https?:/i.test(safeHtml);
}

/** Single pass over raw HTML collecting signals used by the classifier. */
export function analyzeHtml(html: string): HtmlAnalysis {
  const links: ExtractedLink[] = [];
  let remoteResources = 0;
  let images = 0;
  let forms = 0;
  let hiddenText = false;
  let currentLink: ExtractedLink | null = null;

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const style = (attribs.style ?? "").toLowerCase();
        if (/display\s*:\s*none|font-size\s*:\s*0(px)?\b|visibility\s*:\s*hidden/.test(style)) hiddenText = true;
        if (name === "a" && attribs.href) {
          currentLink = { href: attribs.href.trim(), text: "" };
        }
        if (name === "img") {
          images++;
          if (/^https?:/i.test(attribs.src ?? "")) remoteResources++;
        }
        if (name === "form") forms++;
        if (/url\(\s*['"]?https?:/i.test(style)) remoteResources++;
        if (attribs.background && /^https?:/i.test(attribs.background)) remoteResources++;
      },
      ontext(text) {
        if (currentLink && currentLink.text.length < 300) currentLink.text += text;
      },
      onclosetag(name) {
        if (name === "a" && currentLink) {
          currentLink.text = currentLink.text.replace(/\s+/g, " ").trim();
          if (links.length < 500) links.push(currentLink);
          currentLink = null;
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true },
  );
  parser.write(html.slice(0, 2_000_000));
  parser.end();

  const styleBlocks = html.match(/<style[\s\S]*?<\/style>/gi) ?? [];
  for (const block of styleBlocks) {
    remoteResources += (block.match(/url\(\s*['"]?https?:/gi) ?? []).length;
  }
  return { links, remoteResources, images, hiddenText, forms };
}

export function htmlToText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true, ignoreHref: false } },
      { selector: "style", format: "skip" },
    ],
  }).trim();
}

/** Plain-text links ("https://...") for text-only messages. */
export function extractTextLinks(text: string): ExtractedLink[] {
  const out: ExtractedLink[] = [];
  const re = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && out.length < 500) {
    out.push({ href: m[0], text: m[0] });
  }
  return out;
}

/** One-line preview without quoted replies or signatures. */
export function makeSnippet(text: string, max = 200): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith(">")) continue;
    if (/^On .+ wrote:$/i.test(l) || /^Il giorno .+ ha scritto:$/i.test(l)) break;
    if (l === "--" || l === "-- ") break;
    if (l) kept.push(l);
    if (kept.join(" ").length > max * 2) break;
  }
  const s = kept.join(" ").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** Escapes text for inclusion in generated HTML (e.g. quoted replies). */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function textToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\bhttps?:\/\/[^\s<>"')\]]+/g, (url) => `<a href="${url}">${url}</a>`)
    .replace(/\r?\n/g, "<br>");
}

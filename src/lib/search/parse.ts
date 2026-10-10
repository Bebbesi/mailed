import { CATEGORIES, FOLDERS, type CategoryName, type FolderName } from "../types";

export type ParsedSearch = {
  terms: string[];
  phrases: string[];
  excluded: string[];
  from: string[];
  to: string[];
  subject: string[];
  filename: string[];
  labels: string[];
  in: FolderName | "anywhere" | null;
  category: CategoryName | null;
  is: Set<"unread" | "read" | "starred" | "important" | "snoozed">;
  hasAttachment: boolean | null;
  after: Date | null;
  before: Date | null;
  larger: number | null;
  smaller: number | null;
};

const OPERATORS = new Set([
  "from", "to", "subject", "in", "is", "has", "label", "category", "after", "before",
  "newer_than", "older_than", "filename", "larger", "smaller",
]);

function parseDate(value: string): Date | null {
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseRelative(value: string): number | null {
  const m = /^(\d{1,4})([dmy])$/i.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const days = unit === "d" ? n : unit === "m" ? n * 30 : n * 365;
  return days * 86400_000;
}

function parseSize(value: string): number | null {
  const m = /^(\d+(?:\.\d+)?)([kmg]?)b?$/i.exec(value);
  if (!m) return null;
  const mult = { "": 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[m[2].toLowerCase() as "" | "k" | "m" | "g"];
  return Math.round(Number(m[1]) * mult);
}

/** Splits on whitespace while keeping "quoted phrases" and op:"quoted values" together. */
function tokenize(input: string): string[] {
  const out: string[] = [];
  const re = /(-?[a-z_]+:"[^"]*"|-?"[^"]*"|\S+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) && out.length < 50) out.push(m[0]);
  return out;
}

/**
 * Parses Gmail-style search syntax, e.g.
 * `from:alice has:attachment after:2024/01/01 "quarterly report" -draft`.
 */
export function parseSearch(input: string, now = new Date()): ParsedSearch {
  const q: ParsedSearch = {
    terms: [],
    phrases: [],
    excluded: [],
    from: [],
    to: [],
    subject: [],
    filename: [],
    labels: [],
    in: null,
    category: null,
    is: new Set(),
    hasAttachment: null,
    after: null,
    before: null,
    larger: null,
    smaller: null,
  };

  for (const raw of tokenize(input.slice(0, 500))) {
    const negated = raw.startsWith("-") && raw.length > 1;
    const token = negated ? raw.slice(1) : raw;
    const colon = token.indexOf(":");
    const op = colon > 0 ? token.slice(0, colon).toLowerCase() : "";
    if (op && OPERATORS.has(op)) {
      const value = token.slice(colon + 1).replace(/^"|"$/g, "").trim();
      if (!value) continue;
      const lower = value.toLowerCase();
      switch (op) {
        case "from":
          q.from.push(lower);
          break;
        case "to":
          q.to.push(lower);
          break;
        case "subject":
          q.subject.push(value);
          break;
        case "filename":
          q.filename.push(value);
          break;
        case "label":
          q.labels.push(value);
          break;
        case "in":
          if (lower === "anywhere" || lower === "all") q.in = "anywhere";
          else if ((FOLDERS as readonly string[]).includes(lower)) q.in = lower as FolderName;
          break;
        case "category":
          if ((CATEGORIES as readonly string[]).includes(lower)) q.category = lower as CategoryName;
          break;
        case "is":
          if (["unread", "read", "starred", "important", "snoozed"].includes(lower)) {
            q.is.add(lower as "unread" | "read" | "starred" | "important" | "snoozed");
          }
          break;
        case "has":
          if (lower === "attachment" || lower === "attachments") q.hasAttachment = !negated;
          break;
        case "after":
          q.after = parseDate(value);
          break;
        case "before":
          q.before = parseDate(value);
          break;
        case "newer_than": {
          const ms = parseRelative(value);
          if (ms) q.after = new Date(now.getTime() - ms);
          break;
        }
        case "older_than": {
          const ms = parseRelative(value);
          if (ms) q.before = new Date(now.getTime() - ms);
          break;
        }
        case "larger":
          q.larger = parseSize(value);
          break;
        case "smaller":
          q.smaller = parseSize(value);
          break;
      }
      continue;
    }
    if (token.startsWith('"') && token.endsWith('"') && token.length > 2) {
      const phrase = token.slice(1, -1).trim();
      if (phrase) (negated ? q.excluded : q.phrases).push(phrase);
      continue;
    }
    const word = token.trim();
    if (word) (negated ? q.excluded : q.terms).push(word);
  }
  return q;
}

/** Tokens safe to embed in a to_tsquery expression. */
export function tsLexemes(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 20);
}

export function isEmptySearch(q: ParsedSearch): boolean {
  return (
    q.terms.length + q.phrases.length + q.excluded.length + q.from.length + q.to.length + q.subject.length + q.filename.length + q.labels.length === 0 &&
    !q.in &&
    !q.category &&
    q.is.size === 0 &&
    q.hasAttachment === null &&
    !q.after &&
    !q.before &&
    q.larger === null &&
    q.smaller === null
  );
}

import { sql, type SQL } from "drizzle-orm";
import { tsLexemes, type ParsedSearch } from "./parse";

const like = (v: string) => `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Translates a parsed query into a SQL predicate over `m` (messages). Every
 * value is bound as a parameter; nothing from the query is interpolated.
 */
export function searchPredicate(q: ParsedSearch, userId: string, opts: { restrictFolder?: boolean } = {}): SQL {
  const parts: SQL[] = [];

  const positive: string[] = [];
  for (const term of q.terms) {
    const lex = tsLexemes(term);
    if (lex.length) positive.push(lex.map((l) => `${l}:*`).join(" & "));
  }
  for (const phrase of q.phrases) {
    const lex = tsLexemes(phrase);
    if (lex.length) positive.push(lex.join(" <-> "));
  }
  if (positive.length) {
    parts.push(sql`m.search_vector @@ to_tsquery('simple', ${positive.map((p) => `(${p})`).join(" & ")})`);
  }
  for (const ex of q.excluded) {
    const lex = tsLexemes(ex);
    if (lex.length) parts.push(sql`not (m.search_vector @@ to_tsquery('simple', ${lex.join(" <-> ")}))`);
  }
  for (const f of q.from) {
    parts.push(sql`(m.from_address ilike ${like(f)} or m.from_name ilike ${like(f)})`);
  }
  for (const t of q.to) {
    parts.push(
      sql`exists (select 1 from message_recipients r where r.message_id = m.id and (r.address ilike ${like(t)} or r.name ilike ${like(t)}))`,
    );
  }
  for (const s of q.subject) parts.push(sql`m.subject ilike ${like(s)}`);
  for (const f of q.filename) {
    parts.push(sql`exists (select 1 from attachments a where a.message_id = m.id and a.filename ilike ${like(f)})`);
  }
  for (const l of q.labels) {
    parts.push(
      sql`exists (select 1 from message_labels ml join labels lb on lb.id = ml.label_id where ml.message_id = m.id and lb.user_id = ${userId} and lower(lb.name) = lower(${l}))`,
    );
  }
  if (q.in === "anywhere") {
    // no folder restriction
  } else if (q.in) {
    parts.push(sql`m.folder = ${q.in}`);
  } else if (opts.restrictFolder !== false) {
    parts.push(sql`m.folder not in ('spam', 'trash')`);
  }
  if (q.category) parts.push(sql`m.category = ${q.category}`);
  if (q.is.has("unread")) parts.push(sql`not m.is_read`);
  if (q.is.has("read")) parts.push(sql`m.is_read`);
  if (q.is.has("starred")) parts.push(sql`m.is_starred`);
  if (q.is.has("important")) parts.push(sql`m.is_important`);
  if (q.is.has("snoozed")) parts.push(sql`m.snoozed_until is not null`);
  if (q.hasAttachment === true) parts.push(sql`m.has_attachments`);
  if (q.hasAttachment === false) parts.push(sql`not m.has_attachments`);
  if (q.after) parts.push(sql`m.date >= ${q.after.toISOString()}`);
  if (q.before) parts.push(sql`m.date < ${q.before.toISOString()}`);
  if (q.larger !== null) parts.push(sql`m.size_bytes >= ${q.larger}`);
  if (q.smaller !== null) parts.push(sql`m.size_bytes < ${q.smaller}`);

  return parts.length ? sql.join(parts, sql` and `) : sql`true`;
}

const PREFIX = /^\s*((re|r|aw|sv|antw|fwd?|fw|i|inoltro|rif|tr|wg)\s*(\[\d+\])?\s*:\s*)+/i;

/** Subject without reply/forward prefixes, used as a thread title. */
export function normalizeSubject(subject: string): string {
  return subject.replace(PREFIX, "").trim().slice(0, 500);
}

export function replySubject(subject: string): string {
  const base = normalizeSubject(subject);
  return base ? `Re: ${base}` : "Re:";
}

export function forwardSubject(subject: string): string {
  const base = normalizeSubject(subject);
  return base ? `Fwd: ${base}` : "Fwd:";
}

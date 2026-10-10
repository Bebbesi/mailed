/** Date and size formatting that honours the user's locale and time zone settings. */

type Prefs = { locale: string; timeZone: string };

function fmt(prefs: Prefs, opts: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat(prefs.locale, { timeZone: prefs.timeZone, ...opts });
  } catch {
    return new Intl.DateTimeFormat("en-US", opts);
  }
}

function dayKey(d: Date, prefs: Prefs) {
  return fmt(prefs, { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Compact list date: time today, "Mar 4" this year, "3/4/23" before. */
export function listDate(iso: string, prefs: Prefs, now = new Date()) {
  const d = new Date(iso);
  if (dayKey(d, prefs) === dayKey(now, prefs)) return fmt(prefs, { hour: "numeric", minute: "2-digit" }).format(d);
  const sameYear = fmt(prefs, { year: "numeric" }).format(d) === fmt(prefs, { year: "numeric" }).format(now);
  if (sameYear) return fmt(prefs, { month: "short", day: "numeric" }).format(d);
  return fmt(prefs, { year: "2-digit", month: "numeric", day: "numeric" }).format(d);
}

export function fullDate(iso: string, prefs: Prefs) {
  return fmt(prefs, { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function relativeTime(iso: string, prefs: Prefs, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(prefs.locale, { numeric: "auto" });
  if (abs < 60_000) return rtf.format(Math.round(diff / 1000), "second");
  if (abs < 3600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86400_000) return rtf.format(Math.round(diff / 3600_000), "hour");
  if (abs < 30 * 86400_000) return rtf.format(Math.round(diff / 86400_000), "day");
  return fullDate(iso, prefs);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** Value for <input type="datetime-local"> in the browser's zone. */
export function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

"use client";

export type ThemePref = "light" | "dark" | "system";

/** Applies the theme immediately and remembers it for the next server render. */
export function applyTheme(theme: ThemePref) {
  const root = document.documentElement;
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  document.cookie = `mailed_theme=${theme}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
}

"use client";

import { themeMode, type ThemePref } from "../themes";

export type { ThemePref } from "../themes";

/** Applies the theme immediately and remembers it for the next server render. */
export function applyTheme(theme: ThemePref) {
  const root = document.documentElement;
  const dark =
    theme === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches : themeMode(theme) === "dark";
  root.classList.toggle("dark", dark);
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  document.cookie = `mailed_theme=${theme}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
}

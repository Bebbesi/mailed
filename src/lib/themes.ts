/**
 * Theme catalogue shared by the database enum, settings validation, the first
 * server render and the pickers. Colours live in globals.css under
 * `[data-theme="<id>"]`; append new ids at the end (Postgres enum order).
 */
export const THEME_IDS = [
  "light",
  "dark",
  "system",
  "black",
  "oled",
  "midnight",
  "purple",
  "forest",
  "lilac",
  "pink",
  "blue",
  "sand",
] as const;

export type ThemePref = (typeof THEME_IDS)[number];
export type ThemeId = Exclude<ThemePref, "system">;
export type ThemeMode = "light" | "dark";

export type ThemeInfo = { id: ThemeId; label: string; mode: ThemeMode };

/** Display order: light palettes first, then dark ones. */
export const THEMES: readonly ThemeInfo[] = [
  { id: "light", label: "Light", mode: "light" },
  { id: "lilac", label: "Lilac", mode: "light" },
  { id: "pink", label: "Pink", mode: "light" },
  { id: "blue", label: "Blue", mode: "light" },
  { id: "sand", label: "Sand", mode: "light" },
  { id: "dark", label: "Dark", mode: "dark" },
  { id: "black", label: "Black", mode: "dark" },
  { id: "oled", label: "OLED", mode: "dark" },
  { id: "midnight", label: "Midnight blue", mode: "dark" },
  { id: "purple", label: "Purple", mode: "dark" },
  { id: "forest", label: "Forest", mode: "dark" },
];

export function isThemePref(value: unknown): value is ThemePref {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

export function themeMode(id: ThemeId): ThemeMode {
  return THEMES.find((t) => t.id === id)?.mode ?? "light";
}

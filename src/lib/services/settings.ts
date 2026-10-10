import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { userSettings } from "../db/schema";
import { sanitizeEmailHtml } from "../mail/sanitize";
import { CATEGORIES, type SettingsDTO } from "../types";

const validLocale = (v: string) => {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([v]).length > 0;
  } catch {
    return false;
  }
};

const validTimeZone = (v: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v });
    return true;
  } catch {
    return false;
  }
};

export const settingsPatchSchema = z
  .object({
    theme: z.enum(["light", "dark", "system"]),
    density: z.enum(["comfortable", "compact"]),
    displayName: z.string().trim().max(80).nullable(),
    signatureHtml: z.string().max(20_000),
    locale: z.string().max(35).refine(validLocale, "Unsupported language."),
    timeZone: z.string().max(64).refine(validTimeZone, "Unknown time zone."),
    readingPane: z.enum(["right", "off"]),
    markReadOnOpen: z.boolean(),
    remoteImages: z.enum(["ask", "always"]),
    inboxCategories: z.boolean(),
    undoSendSeconds: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(20), z.literal(30)]),
    pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]),
    notifyInApp: z.boolean(),
    notifyBrowser: z.boolean(),
    mutedCategories: z.array(z.enum(CATEGORIES)).max(6),
  })
  .partial();

const toDTO = (s: typeof userSettings.$inferSelect): SettingsDTO => ({
  theme: s.theme,
  density: s.density,
  displayName: s.displayName,
  signatureHtml: s.signatureHtml,
  locale: s.locale,
  timeZone: s.timeZone,
  readingPane: s.readingPane,
  markReadOnOpen: s.markReadOnOpen,
  remoteImages: s.remoteImages,
  inboxCategories: s.inboxCategories,
  undoSendSeconds: s.undoSendSeconds,
  pageSize: s.pageSize,
  notifyInApp: s.notifyInApp,
  notifyBrowser: s.notifyBrowser,
  mutedCategories: s.mutedCategories,
});

export async function getSettings(userId: string): Promise<SettingsDTO> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (row) return toDTO(row);
  const [created] = await db.insert(userSettings).values({ userId }).onConflictDoNothing().returning();
  if (created) return toDTO(created);
  const [again] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return toDTO(again);
}

export async function updateSettings(userId: string, patch: z.infer<typeof settingsPatchSchema>): Promise<SettingsDTO> {
  await getSettings(userId);
  const values = { ...patch };
  if (values.signatureHtml !== undefined) values.signatureHtml = sanitizeEmailHtml(values.signatureHtml);
  if (values.displayName !== undefined && values.displayName === "") values.displayName = null;
  const [row] = await db
    .update(userSettings)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId))
    .returning();
  return toDTO(row);
}

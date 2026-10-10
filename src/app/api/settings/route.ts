import { authed, readJson } from "@/lib/api/handler";
import { getSettings, settingsPatchSchema, updateSettings } from "@/lib/services/settings";

export const GET = authed(async ({ user }) => getSettings(user.id));

export const PATCH = authed(async ({ req, user }) => updateSettings(user.id, await readJson(req, settingsPatchSchema, 100_000)));

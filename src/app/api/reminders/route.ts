import { authed, readJson } from "@/lib/api/handler";
import { createReminder, reminderInputSchema } from "@/lib/services/reminders";

export const POST = authed(async ({ req, user }) => createReminder(user.id, await readJson(req, reminderInputSchema)));

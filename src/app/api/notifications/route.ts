import { authed } from "@/lib/api/handler";
import { clearNotifications, listNotifications } from "@/lib/services/notifications";

export const GET = authed(async ({ user }) => {
  const { items, unread } = await listNotifications(user.id);
  return {
    unread,
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      threadId: n.threadId,
      read: Boolean(n.readAt),
      createdAt: n.createdAt.toISOString(),
    })),
  };
});

export const DELETE = authed(async ({ user }) => {
  await clearNotifications(user.id);
  return { ok: true };
});

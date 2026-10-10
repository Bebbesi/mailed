import { authed } from "@/lib/api/handler";
import { readUpload } from "@/lib/api/upload";
import { readAvatar, removeAvatar, setAvatar } from "@/lib/services/account";

export const GET = authed(async ({ user }) => {
  const { data, contentType } = await readAvatar(user.id);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
});

export const POST = authed(async ({ req, user }) => {
  const file = await readUpload(req, "file", 2 * 1024 * 1024);
  return setAvatar(user.id, file.data);
});

export const DELETE = authed(async ({ user }) => {
  await removeAvatar(user.id);
  return { ok: true };
});

import { eq } from "drizzle-orm";
import MailComposer from "nodemailer/lib/mail-composer";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession } from "@/lib/auth/session-core";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { registerUser } from "@/lib/services/auth";
import { cookieJar } from "./cookies";

let counter = 0;

export async function createUser(opts: { username?: string; verified?: boolean; password?: string } = {}) {
  counter++;
  const username = opts.username ?? `user${counter}`;
  const password = opts.password ?? "correct-horse-battery-staple";
  const { user } = await registerUser({
    firstName: "Test",
    lastName: `User${counter}`,
    username,
    recoveryEmail: `${username}.recovery@example.org`,
    password,
  });
  if (opts.verified !== false) {
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
  }
  return { ...user, password };
}

/** Signs a user in for subsequent route-handler calls. */
export async function signIn(userId: string) {
  const { token } = await createSession(userId, { ip: "127.0.0.1", userAgent: "vitest" });
  cookieJar.set(SESSION_COOKIE, token);
  return token;
}

export function signOut() {
  cookieJar.clear();
}

export function request(
  method: string,
  path: string,
  body?: unknown,
  opts: { origin?: string | null; headers?: Record<string, string> } = {},
) {
  const headers = new Headers(opts.headers);
  headers.set("host", "localhost:3000");
  headers.set("x-forwarded-for", "127.0.0.1");
  if (opts.origin !== null && method !== "GET") headers.set("origin", opts.origin ?? "http://localhost:3000");
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers.set("content-type", "application/json");
    payload = JSON.stringify(body);
  }
  return new NextRequest(new URL(path, "http://localhost:3000"), { method, headers, body: payload });
}

export function ctx<P extends Record<string, string>>(params: P = {} as P) {
  return { params: Promise.resolve(params) };
}

export async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export async function rawEmail(opts: {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  messageId?: string;
  inReplyTo?: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: Buffer | string; contentType?: string }[];
}) {
  const composer = new MailComposer({
    from: opts.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    messageId: opts.messageId ? `<${opts.messageId}>` : undefined,
    inReplyTo: opts.inReplyTo ? `<${opts.inReplyTo}>` : undefined,
    references: opts.inReplyTo ? `<${opts.inReplyTo}>` : undefined,
    headers: opts.headers,
    attachments: opts.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return composer.compile().build();
}

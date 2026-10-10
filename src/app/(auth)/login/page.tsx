import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

function safeNext(next: string | undefined) {
  return next && next.startsWith("/app") && !next.startsWith("//") ? next : "/app/inbox";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  if (await getCurrentSession()) redirect(safeNext(sp.next));
  return <LoginForm next={safeNext(sp.next)} passwordReset={sp.reset === "1"} />;
}

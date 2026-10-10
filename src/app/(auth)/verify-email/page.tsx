import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { AuthCard, FormAlert } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { getCurrentSession } from "@/lib/auth/session";
import { recordSecurityEvent } from "@/lib/security-events";
import { verifyEmailToken } from "@/lib/services/auth";
import { ResendVerification } from "./resend";

export const metadata: Metadata = { title: "Verify email", referrer: "no-referrer" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const session = await getCurrentSession();

  if (token) {
    const user = await verifyEmailToken(token);
    if (user) {
      await recordSecurityEvent("email_verified", { userId: user.id });
      return (
        <AuthCard title="Email confirmed">
          <div className="flex gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
            <p className="text-[13px] leading-relaxed text-ink-muted">
              <span className="font-medium text-ink">{user.recoveryEmail}</span> is now your recovery email. You can use it to reset your password,
              and you can now send mail to addresses outside Mailed.
            </p>
          </div>
          <Button asChild variant="primary" className="mt-6 w-full">
            <Link href={session ? "/app/inbox" : "/login"}>{session ? "Go to inbox" : "Sign in"}</Link>
          </Button>
        </AuthCard>
      );
    }
    return (
      <AuthCard title="This link can't be used">
        <FormAlert>The confirmation link is invalid, has expired, or was already used.</FormAlert>
        {session && !session.user.emailVerifiedAt ? <ResendVerification email={session.user.recoveryEmail} /> : null}
        <Button asChild variant="secondary" className="mt-6 w-full">
          <Link href={session ? "/app/inbox" : "/login"}>{session ? "Go to inbox" : "Sign in"}</Link>
        </Button>
      </AuthCard>
    );
  }

  if (session && !session.user.emailVerifiedAt) {
    return (
      <AuthCard title="Confirm your recovery email" description={`We sent a link to ${session.user.recoveryEmail}. Open it to confirm the address.`}>
        <ResendVerification email={session.user.recoveryEmail} />
        <Button asChild variant="secondary" className="mt-6 w-full">
          <Link href="/app/inbox">Go to inbox</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Verify email">
      <p className="text-[13px] text-ink-muted">{session ? "Your recovery email is already confirmed." : "Open the link from the confirmation email to continue."}</p>
      <Button asChild variant="primary" className="mt-6 w-full">
        <Link href={session ? "/app/inbox" : "/login"}>{session ? "Go to inbox" : "Sign in"}</Link>
      </Button>
    </AuthCard>
  );
}

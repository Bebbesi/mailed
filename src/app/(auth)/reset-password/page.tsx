import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard, FormAlert } from "@/components/auth/auth-card";
import { peekAuthToken } from "@/lib/auth/tokens";
import { ResetPasswordForm } from "./form";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = token ? await peekAuthToken(token, "reset_password") : null;
  if (!token || !valid) {
    return (
      <AuthCard
        title="This link can't be used"
        footer={
          <Link href="/login" className="font-medium text-accent-ink hover:underline">
            Back to sign in
          </Link>
        }
      >
        <FormAlert>The reset link is invalid, has expired, or was already used.</FormAlert>
        <p className="mt-4 text-[13px] text-ink-subtle">
          <Link href="/forgot-password" className="font-medium text-accent-ink hover:underline">
            Request a new link
          </Link>
        </p>
      </AuthCard>
    );
  }
  return <ResetPasswordForm token={token} />;
}

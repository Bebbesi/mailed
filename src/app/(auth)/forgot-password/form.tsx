"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthCard, FormAlert } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/client/api";

const schema = z.object({ identifier: z.string().trim().min(1, "Enter your Mailed address or recovery email.") });

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api("/api/auth/forgot-password", { body: values });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  if (sent) {
    return (
      <AuthCard
        title="Check your recovery email"
        footer={
          <Link href="/login" className="font-medium text-accent-ink hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="flex gap-3">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
          <p className="text-[13px] leading-relaxed text-ink-muted">
            If an account matches what you entered and its recovery email is confirmed, we&apos;ve sent a link to reset the password. The link
            expires in one hour.
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your Mailed address or recovery email. We'll send a reset link to your confirmed recovery email."
      footer={
        <Link href="/login" className="font-medium text-accent-ink hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Field id="identifier" label="Email address" error={formState.errors.identifier?.message}>
          <Input {...fieldAria("identifier", formState.errors.identifier?.message)} autoComplete="username" autoFocus {...register("identifier")} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={formState.isSubmitting}>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}

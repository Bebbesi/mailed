"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthCard, FormAlert } from "@/components/auth/auth-card";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/client/api";

const schema = z.object({
  identifier: z.string().trim().min(1, "Enter your email address."),
  password: z.string().min(1, "Enter your password."),
});

export function LoginForm({ next, passwordReset }: { next: string; passwordReset: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const errors = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api("/api/auth/login", { body: values });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  return (
    <AuthCard
      title="Sign in to Mailed"
      description="Use your Mailed address or recovery email."
      footer={
        <>
          New to Mailed?{" "}
          <Link href="/register" className="font-medium text-accent-ink hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {passwordReset ? <FormAlert tone="ok">Your password was changed. Sign in with the new password.</FormAlert> : null}
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Field id="identifier" label="Email address" error={errors.identifier?.message}>
          <Input {...fieldAria("identifier", errors.identifier?.message)} autoComplete="username" autoFocus inputMode="email" {...register("identifier")} />
        </Field>
        <Field
          id="password"
          label="Password"
          error={errors.password?.message}
          trailing={
            <Link href="/forgot-password" className="text-xs font-medium text-accent-ink hover:underline">
              Forgot password?
            </Link>
          }
        >
          <PasswordInput {...fieldAria("password", errors.password?.message)} autoComplete="current-password" {...register("password")} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}

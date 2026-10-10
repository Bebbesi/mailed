"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthCard, FormAlert } from "@/components/auth/auth-card";
import { PasswordInput, StrengthMeter } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Field, fieldAria } from "@/components/ui/field";
import { api, errorMessage } from "@/lib/client/api";

const schema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters.").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The passwords don't match.", path: ["confirm"] });

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState, watch } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const errors = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api("/api/auth/reset-password", { body: { token, password: values.password } });
      router.replace("/login?reset=1");
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  return (
    <AuthCard title="Choose a new password" description="You'll be signed out on all devices after the change.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Field id="password" label="New password" error={errors.password?.message}>
          <PasswordInput {...fieldAria("password", errors.password?.message)} autoComplete="new-password" autoFocus {...register("password")} />
        </Field>
        <StrengthMeter password={watch("password") ?? ""} />
        <Field id="confirm" label="Confirm password" error={errors.confirm?.message}>
          <PasswordInput {...fieldAria("confirm", errors.confirm?.message)} autoComplete="new-password" {...register("confirm")} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={formState.isSubmitting}>
          Change password
        </Button>
      </form>
    </AuthCard>
  );
}

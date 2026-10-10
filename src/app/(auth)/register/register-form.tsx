"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthCard, FormAlert } from "@/components/auth/auth-card";
import { PasswordInput, StrengthMeter } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, fieldAria } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiError, errorMessage } from "@/lib/client/api";

const schema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(60),
  lastName: z.string().trim().min(1, "Enter your last name.").max(60),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Use at least 3 characters.")
    .max(32, "Use at most 32 characters.")
    .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, "Use letters, numbers, dots, dashes or underscores."),
  recoveryEmail: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(10, "Use at least 10 characters.").max(128),
  terms: z.literal(true, { message: "Accept the terms to continue." }),
});

type Values = z.infer<typeof schema>;
type Availability = { state: "idle" | "checking" | "available" | "taken"; reason?: string };

export function RegisterForm({ domain }: { domain: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability>({ state: "idle" });
  const { register, handleSubmit, formState, watch, setValue, setError: setFieldError } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { terms: false as unknown as true },
  });
  const errors = formState.errors;
  const username = watch("username") ?? "";
  const password = watch("password") ?? "";
  const terms = watch("terms");

  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (u.length < 3) {
      setAvailability({ state: "idle" });
      return;
    }
    setAvailability({ state: "checking" });
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await api<{ available: boolean; reason?: string }>(`/api/auth/username-available?u=${encodeURIComponent(u)}`, { signal: ctrl.signal });
        setAvailability({ state: res.available ? "available" : "taken", reason: res.reason });
      } catch {
        setAvailability({ state: "idle" });
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [username]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api("/api/auth/register", {
        body: {
          firstName: values.firstName,
          lastName: values.lastName,
          username: values.username,
          recoveryEmail: values.recoveryEmail,
          password: values.password,
        },
      });
      router.replace("/app/inbox?welcome=1");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.field && ["username", "recoveryEmail", "password", "firstName", "lastName"].includes(err.field)) {
        setFieldError(err.field as keyof Values, { message: err.message });
      } else {
        setError(errorMessage(err));
      }
    }
  });

  const usernameHint =
    availability.state === "checking" ? (
      <span className="inline-flex items-center gap-1.5">
        <Spinner className="size-3" /> Checking availability…
      </span>
    ) : availability.state === "available" ? (
      <span className="inline-flex items-center gap-1 text-ok">
        <Check className="size-3.5" /> {username.toLowerCase()}@{domain} is available
      </span>
    ) : availability.state === "taken" ? (
      <span className="inline-flex items-center gap-1 text-danger">
        <X className="size-3.5" /> {availability.reason ?? "This address is taken."}
      </span>
    ) : (
      "This will be your email address."
    );

  return (
    <AuthCard
      title="Create your Mailed account"
      description="Choose an address and set a password."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent-ink hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error ? <FormAlert>{error}</FormAlert> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field id="firstName" label="First name" error={errors.firstName?.message}>
            <Input {...fieldAria("firstName", errors.firstName?.message)} autoComplete="given-name" autoFocus {...register("firstName")} />
          </Field>
          <Field id="lastName" label="Last name" error={errors.lastName?.message}>
            <Input {...fieldAria("lastName", errors.lastName?.message)} autoComplete="family-name" {...register("lastName")} />
          </Field>
        </div>
        <Field id="username" label="Mailed address" error={errors.username?.message} hint={usernameHint}>
          <div className="flex rounded-md shadow-xs">
            <Input
              {...fieldAria("username", errors.username?.message, true)}
              className="rounded-r-none shadow-none"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              {...register("username")}
            />
            <span className="inline-flex items-center rounded-r-md border border-l-0 border-line-strong bg-hover px-3 text-sm text-ink-subtle">@{domain}</span>
          </div>
        </Field>
        <Field id="recoveryEmail" label="Recovery email" error={errors.recoveryEmail?.message} hint="We'll send a confirmation link here. It's used to reset your password.">
          <Input {...fieldAria("recoveryEmail", errors.recoveryEmail?.message, true)} type="email" autoComplete="email" inputMode="email" {...register("recoveryEmail")} />
        </Field>
        <Field id="password" label="Password" error={errors.password?.message} hint="At least 10 characters. A short sentence works well.">
          <PasswordInput {...fieldAria("password", errors.password?.message, true)} autoComplete="new-password" {...register("password")} />
        </Field>
        <StrengthMeter password={password} />
        <div className="space-y-1.5">
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="terms"
              checked={Boolean(terms)}
              onCheckedChange={(v) => setValue("terms", v as true, { shouldValidate: formState.isSubmitted })}
              className="mt-0.5"
              aria-label="Accept terms"
            />
            <label htmlFor="terms" className="text-[13px] leading-relaxed text-ink-muted">
              I agree to the{" "}
              <Link href="/terms" target="_blank" className="font-medium text-accent-ink hover:underline">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" target="_blank" className="font-medium text-accent-ink hover:underline">
                Privacy policy
              </Link>
              .
            </label>
          </div>
          {errors.terms ? (
            <p role="alert" className="text-xs text-danger">
              {errors.terms.message}
            </p>
          ) : null}
        </div>
        <Button type="submit" variant="primary" className="w-full" loading={formState.isSubmitting} disabled={availability.state === "taken"}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}

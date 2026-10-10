import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { env, primaryDomain } from "@/lib/env";
import { AuthCard, FormAlert } from "@/components/auth/auth-card";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  if (await getCurrentSession()) redirect("/app/inbox");
  if (!env().REGISTRATION_ENABLED) {
    return (
      <AuthCard title="Registration is closed">
        <FormAlert tone="info">New accounts can&apos;t be created on this server right now.</FormAlert>
      </AuthCard>
    );
  }
  return <RegisterForm domain={primaryDomain()} />;
}

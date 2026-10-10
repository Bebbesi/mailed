import type { Metadata } from "next";
import { Suspense } from "react";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/mail/app-shell";
import { requireSession } from "@/lib/auth/session";
import { getMe } from "@/lib/services/account";
import { listLabels } from "@/lib/services/labels";
import { getSettings } from "@/lib/services/settings";

export const metadata: Metadata = { title: "Mail", robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();
  const [me, settings, labels] = await Promise.all([getMe(user.id), getSettings(user.id), listLabels(user.id)]);
  return (
    <Providers>
      <Suspense>
        <AppShell initialMe={me} initialSettings={settings} initialLabels={labels}>
          {children}
        </AppShell>
      </Suspense>
    </Providers>
  );
}

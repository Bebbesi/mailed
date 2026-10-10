import { SiteFooter, SiteHeader } from "@/components/marketing/site-header";
import { getCurrentSession } from "@/lib/auth/session";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession().catch(() => null);
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-md">
        Skip to content
      </a>
      <SiteHeader signedIn={Boolean(session)} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

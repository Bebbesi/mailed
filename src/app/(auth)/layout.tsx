import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Providers } from "@/components/providers";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="flex min-h-dvh flex-col bg-sidebar">
        <header className="flex h-16 items-center px-4 sm:px-6">
          <Link href="/" aria-label="Mailed home" className="rounded-md">
            <Logo />
          </Link>
        </header>
        <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:pt-12">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>
        <footer className="flex justify-center gap-6 pb-8 text-xs text-ink-subtle">
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/support" className="hover:text-ink">
            Support
          </Link>
        </footer>
      </div>
    </Providers>
  );
}

import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Mailed home" className="rounded-md">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 text-[13px] font-medium text-ink-subtle md:flex">
          <Link href="/#features" className="hover:text-ink">
            Features
          </Link>
          <Link href="/#security" className="hover:text-ink">
            Security
          </Link>
          <Link href="/support" className="hover:text-ink">
            Support
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <Button asChild variant="primary" size="sm">
              <Link href="/app/inbox">Open inbox</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild variant="primary" size="sm">
                <Link href="/register">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3 text-[13px] text-ink-subtle">
          <Logo />
          <span className="hidden sm:inline">·</span>
          <span>Email that stays out of your way.</span>
        </div>
        <nav aria-label="Legal" className="flex gap-6 text-[13px] text-ink-subtle">
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/support" className="hover:text-ink">
            Support
          </Link>
        </nav>
      </div>
    </footer>
  );
}

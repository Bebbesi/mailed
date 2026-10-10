import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div>
        <p className="text-sm font-medium text-ink-subtle">404</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-[13px] text-ink-subtle">The link may be broken, or the page may have been removed.</p>
      </div>
      <Link href="/" className="text-[13px] font-medium text-accent-ink hover:underline">
        Go to Mailed
      </Link>
    </main>
  );
}

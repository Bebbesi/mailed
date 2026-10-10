import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mailed", template: "%s · Mailed" },
  description: "Mailed is a calm, fast email service with smart organisation, spam protection and privacy by default.",
  applicationName: "Mailed",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0e" },
  ],
};

const SYSTEM_THEME_SCRIPT = `try{if(window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const theme = (await cookies()).get("mailed_theme")?.value;
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}${theme === "dark" ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <head>{theme === "system" ? <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} /> : null}</head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}

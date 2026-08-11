import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { SiteFooter } from "./_components/site-footer";
import { SiteHeader } from "./_components/site-header";

const body = Geist({ subsets: ["latin"], variable: "--font-body" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL("https://usefixmap.vercel.app"),
  title: { default: "FixMap — Know where to start", template: "%s | FixMap" },
  description:
    "Give FixMap a software problem. It finds the files most likely to matter, the checks to run, and the risks to review before anything changes.",
  keywords: [
    "AI coding agents",
    "developer tools",
    "GitHub Actions",
    "Model Context Protocol",
    "repository context",
    "repo intelligence"
  ],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "FixMap — Know where to start",
    description: "A practical map for coding agents and the people who review their work.",
    siteName: "FixMap",
    url: "/",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "FixMap — Know where to start",
    description: "A practical map for coding agents and the people who review their work."
  },
  icons: { icon: "/fixmap-mark.png", apple: "/fixmap-mark.png" }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" }
  ]
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${mono.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <Script id="fixmap-theme-init" strategy="beforeInteractive">{`try{const t=localStorage.getItem("fixmap-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch{}`}</Script>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <SiteHeader />
        <div id="main-content" tabIndex={-1}>{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}

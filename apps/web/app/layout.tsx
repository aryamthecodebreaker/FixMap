import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Archivo, Fragment_Mono } from "next/font/google";
import Script from "next/script";
import { SiteFooter } from "./_components/site-footer";
import { SiteHeader } from "./_components/site-header";

const sans = Archivo({ subsets: ["latin"], variable: "--font-sans", axes: ["wdth"] });
const mono = Fragment_Mono({ subsets: ["latin"], weight: "400", variable: "--font-mono" });

const title = "FixMap — tell your AI coding tool where to start";
const description =
  "Describe what is broken. FixMap checks your project and tells your AI coding tool which files to open, which tests to run, and what else to review.";

export const metadata: Metadata = {
  metadataBase: new URL("https://fixmap.aryam.me"),
  title: { default: title, template: "%s | FixMap" },
  description,
  keywords: ["AI coding tools", "developer tools", "GitHub Actions", "Model Context Protocol", "Claude Code", "Codex", "Cursor"],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: { title, description, siteName: "FixMap", url: "/", type: "website" },
  twitter: { card: "summary_large_image", title, description },
  icons: { icon: "/icon.svg", apple: "/fixmap-mark.png" }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e12" }
  ]
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} data-theme="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        {/* Dark is the default; a saved choice wins. */}
        <Script id="fixmap-theme-init" strategy="beforeInteractive">{`try{const t=localStorage.getItem("fixmap-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch{}`}</Script>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <SiteHeader />
        <main id="main-content" tabIndex={-1}>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

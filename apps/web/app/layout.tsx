import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";

const display = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT"],
  variable: "--font-display"
});
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL("https://fixmap-flax.vercel.app"),
  title: "FixMap — Repo maps for coding agents",
  description: "Paste a public GitHub issue URL and get ranked files, test routes, risk notes, and explainable diagnostics. Local-first and open source.",
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
    title: "FixMap — Give coding agents a map before they edit",
    description: "Paste a GitHub issue URL and get local-first repository context, test routes, and explainable diagnostics.",
    siteName: "FixMap",
    url: "/",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "FixMap — Give coding agents a map before they edit",
    description: "Paste a GitHub issue URL and get local-first repository context, test routes, and explainable diagnostics."
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <div className="atmosphere" aria-hidden />
        {children}
      </body>
    </html>
  );
}

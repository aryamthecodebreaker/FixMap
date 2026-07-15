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
  description: "Turn an issue or git diff into relevant files, test routes, risk notes, and a review receipt. Local-first and open source.",
  keywords: ["AI coding", "developer tools", "code review", "GitHub Actions", "repo intelligence"],
  openGraph: {
    title: "FixMap — Give coding agents a map before they edit",
    description: "Local-first repo context, test routing, and review receipts for AI-assisted development.",
    type: "website"
  },
  twitter: { card: "summary_large_image" }
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

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Browser, LockKey, Sparkle } from "@phosphor-icons/react/ssr";
import { Demo } from "../demo";

export const metadata: Metadata = {
  title: "Live demo",
  description: "Try FixMap's Plan, Explain, and Verify workflow on a sample repository directly in your browser."
};

export default function DemoPage() {
  return (
    <main>
      <section className="subpage-hero compact-hero page-shell">
        <p className="eyebrow">Live demo</p>
        <h1>See the map form <em>in real time.</em></h1>
        <p>
          Try Plan, Explain, and Verify against a small sample repository. This is the same core
          logic used by the CLI, running locally in your browser—not a recording or staged result.
        </p>
        <div className="inline-facts">
          <span><Browser size={20} aria-hidden /> Runs in this tab</span>
          <span><LockKey size={20} aria-hidden /> Nothing is uploaded</span>
          <span><Sparkle size={20} aria-hidden /> Start with the first preset</span>
        </div>
      </section>

      <section className="section page-shell demo-page-section">
        <Demo />
      </section>

      <section className="section page-shell demo-next">
        <div><p className="eyebrow">Ready for your repository?</p><h2>Take the same workflow to the terminal.</h2></div>
        <div><p>Run one command for a public GitHub issue, or use FixMap locally for private source and working-tree diffs.</p><Link className="button primary" href="/get-started">Choose a setup <ArrowRight size={18} weight="bold" aria-hidden /></Link></div>
      </section>
    </main>
  );
}

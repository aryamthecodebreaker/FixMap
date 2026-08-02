import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Minus, WarningCircle } from "@phosphor-icons/react/ssr";
import { repoUrl, siteStats } from "../_lib/site-data";

export const metadata: Metadata = {
  title: "Evidence",
  description: "Read FixMap's held-out and regression benchmark results, methodology, confidence intervals, misses, and limitations."
};

const percent = (value: number, total: number) => `${Math.round((value / total) * 100)}%`;

// A plain-English reading of the measured rate, so the callout cannot claim "three quarters"
// after a re-record moves the number to two thirds. Bands, not a fabricated precision.
function describeRate(value: number, total: number): string {
  const share = value / total;
  if (share >= 0.9) return "almost all";
  if (share >= 0.7) return "about three quarters";
  if (share >= 0.58) return "about two thirds";
  if (share >= 0.42) return "about half";
  if (share >= 0.28) return "about a third";
  return "a minority";
}

export default function EvidencePage() {
  return (
    <main>
      <section className="subpage-hero page-shell evidence-hero">
        <p className="eyebrow">Evidence</p>
        <h1>Measured honestly.<br /><em>Misses included.</em></h1>
        <p>
          Every benchmark case is a real issue later closed by a merged pull request. FixMap sees
          the repository before the fix and tries to surface the file that actually changed.
        </p>
        <div className="button-row"><a className="button primary" href={`${repoUrl}/tree/main/benchmarks`}>Open benchmark data <ArrowRight size={18} weight="bold" aria-hidden /></a></div>
      </section>

      <section className="section page-shell score-section">
        <div className="score-grid">
          <article className="score-card featured">
            <p className="eyebrow">Held-out · {siteStats.heldout.cases} repositories</p>
            <strong>{siteStats.heldout.top3}/{siteStats.heldout.cases}</strong>
            <h2>fixes surfaced in the top 3</h2>
            <p>Selected after the ranker was finished. This is the result to plan around.</p>
            <dl><div><dt>Top 1</dt><dd>{siteStats.heldout.top1}/{siteStats.heldout.cases} · {percent(siteStats.heldout.top1, siteStats.heldout.cases)}</dd></div><div><dt>Top 5</dt><dd>{siteStats.heldout.top5}/{siteStats.heldout.cases} · {percent(siteStats.heldout.top5, siteStats.heldout.cases)}</dd></div></dl>
          </article>
          <article className="score-card">
            <p className="eyebrow">Regression · {siteStats.regression.cases} repositories</p>
            <strong>{siteStats.regression.top3}/{siteStats.regression.cases}</strong>
            <h2>fixes surfaced in the top 3</h2>
            <p>These cases guided development. They prove regressions are caught, not generalization.</p>
            <dl><div><dt>Top 1</dt><dd>{siteStats.regression.top1}/{siteStats.regression.cases} · {percent(siteStats.regression.top1, siteStats.regression.cases)}</dd></div><div><dt>Top 5</dt><dd>{siteStats.regression.top5}/{siteStats.regression.cases} · {percent(siteStats.regression.top5, siteStats.regression.cases)}</dd></div></dl>
          </article>
        </div>
        <div className="evidence-callout"><WarningCircle size={25} aria-hidden /><p><strong>Read this as “{describeRate(siteStats.heldout.top3, siteStats.heldout.cases)},” not as two significant figures.</strong> With {siteStats.heldout.cases} held-out cases, one result changing moves Top-3 by roughly {Math.round(100 / siteStats.heldout.cases)} points. The 95% interval is {Math.round((siteStats.heldout.intervals95.top3[0] ?? 0) * 100)}–{Math.round((siteStats.heldout.intervals95.top3[1] ?? 0) * 100)}%.</p></div>
      </section>

      <section className="section table-section">
        <div className="page-shell">
          <div className="section-heading split-heading"><div><p className="eyebrow">Held-out results</p><h2>Every case, not just the wins.</h2></div><p>The expected path is the file changed by the merged fix. “Top 3” means that path appeared in FixMap&apos;s first three results.</p></div>
          <div className="results-table" role="table" aria-label="Held-out benchmark results">
            <div className="results-row results-head" role="row"><span role="columnheader">Repository</span><span role="columnheader">Expected file</span><span role="columnheader">Top result</span><span role="columnheader">Top 3</span></div>
            {siteStats.heldout.results.map((result) => (
              <div className="results-row" role="row" key={result.slug}>
                <span role="cell"><a href={`https://github.com/${result.slug}/issues/${result.issue}`}>{result.slug} #{result.issue}</a></span>
                <code role="cell">{result.expected[0]}</code>
                <code role="cell">{result.top5[0]}</code>
                <span role="cell" className={result.top3 ? "result-hit" : "result-miss"}>{result.top3 ? <Check size={18} weight="bold" aria-hidden /> : <Minus size={18} weight="bold" aria-hidden />}{result.top3 ? "Hit" : "Miss"}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section page-shell methodology">
        <div className="section-heading"><p className="eyebrow">Methodology</p><h2>What the benchmark does—and does not—show.</h2></div>
        <div className="method-grid">
          <article><span>01</span><h3>Real issues</h3><p>The task text comes from a public issue, not a prompt written to flatter the ranker.</p></article>
          <article><span>02</span><h3>Pre-fix repository</h3><p>The repository is checked out before the merged change so the answer is not already embedded in the diff.</p></article>
          <article><span>03</span><h3>Mechanical scoring</h3><p>A hit means a changed file appeared at a measured rank. Nothing is graded by taste.</p></article>
          <article><span>04</span><h3>No time-saved claim</h3><p>FixMap has not run a controlled study of the same tasks with and without the tool, so this site does not invent one.</p></article>
        </div>
      </section>

      <section className="section dark-section"><div className="page-shell evidence-bottom"><div><p className="eyebrow">Trust the boundary</p><h2>A starting map is useful even when it is imperfect.</h2></div><div><p>FixMap narrows the search and exposes uncertainty. It does not replace reading, testing, or review.</p><Link className="button light" href="/demo">Try the weakest sample <ArrowRight size={18} weight="bold" aria-hidden /></Link></div></div></section>
    </main>
  );
}

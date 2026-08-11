import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Minus, WarningCircle } from "@phosphor-icons/react/ssr";
import { repoUrl, siteStats } from "../_lib/site-data";

export const metadata: Metadata = {
  title: "Evidence",
  description: "Read FixMap's held-out, regression, and adversarial benchmark results, methodology, confidence intervals, misses, and limitations.",
  alternates: { canonical: "/evidence" },
  openGraph: {
    title: "FixMap evidence",
    description: "Held-out, baseline, and adversarial results with misses and limitations included.",
    url: "/evidence"
  }
};

const percent = (value: number, total: number) => `${Math.round((value / total) * 100)}%`;
const rate = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);

const heldoutUnmentioned = siteStats.heldout.cohorts.unmentioned;
const heldoutMentioned = siteStats.heldout.cohorts.mentioned;
const heldoutBaselines = siteStats.baselines.heldout;

// A plain-English reading of the measured rate, so the callout cannot claim "three quarters"
// after a re-record moves the number to two thirds. Bands, not a fabricated precision.
function describeRate(share: number): string {
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
        <h1>Measured honestly.{" "}<br /><em>Misses included.</em></h1>
        <p>
          Every benchmark case is a real issue later closed by a merged pull request. FixMap sees
          the repository before the fix and tries to surface the file that actually changed.
        </p>
        <div className="button-row"><a className="button primary" href={`${repoUrl}/tree/main/benchmarks`}>Open benchmark data <ArrowRight size={18} weight="bold" aria-hidden /></a></div>
      </section>

      <section className="section page-shell">
        <div className="section-heading split-heading">
          <div><p className="eyebrow">Confidence calibration</p><h2>Labels are evidence bands, not probabilities.</h2></div>
          <p>Across the held-out and external suites, high confidence is not more accurate than medium in this small sample. The counts are published so readers can see that limitation instead of treating a label as a calibrated chance of correctness.</p>
        </div>
        <div className="results-table" role="table" aria-label="Top-result accuracy by FixMap confidence label">
          <div className="results-row results-head" role="row"><span role="columnheader">Top label</span><span role="columnheader">Cases</span><span role="columnheader">Correct</span><span role="columnheader">Accuracy</span></div>
          {siteStats.confidenceCalibration.map((band) => (
            <div className="results-row" role="row" key={band.confidence}><span role="cell">{band.confidence}</span><span role="cell">{band.cases}</span><span role="cell">{band.correct}</span><span role="cell">{rate(band.accuracy)}</span></div>
          ))}
        </div>
      </section>

      <section className="section page-shell">
        <div className="section-heading split-heading">
          <div><p className="eyebrow">Adversarial gate</p><h2>{siteStats.adversarial.passed}/{siteStats.adversarial.cases} cases pass.</h2></div>
          <p>The checked-in adversarial record covers fabricated identifiers, wrong repositories, vague tasks, and generated output. Its measured false-confidence rate is {Math.round(siteStats.adversarial.falseConfidenceRate * 100)}%.</p>
        </div>
      </section>

      <section className="section page-shell score-section">
        <div className="score-grid">
          <article className="score-card featured">
            <p className="eyebrow">Held-out · tasks that did not name the file · {heldoutUnmentioned.cases} repositories</p>
            <strong>{rate(heldoutUnmentioned.top3HitRate)}</strong>
            <h2>fixes surfaced in the top 3</h2>
            <p>Selected after the ranker was finished, and counting only the cases where FixMap had to locate the file rather than read it out of the task. This is the result to plan around.</p>
            <dl><div><dt>Top 1</dt><dd>{rate(heldoutUnmentioned.top1HitRate)}</dd></div><div><dt>Top 5</dt><dd>{rate(heldoutUnmentioned.top5HitRate)}</dd></div></dl>
          </article>
          <article className="score-card">
            <p className="eyebrow">Regression · {siteStats.regression.cases} repositories</p>
            <strong>{siteStats.regression.top3}/{siteStats.regression.cases}</strong>
            <h2>fixes surfaced in the top 3</h2>
            <p>These cases guided development. They prove regressions are caught, not generalization.</p>
            <dl><div><dt>Top 1</dt><dd>{siteStats.regression.top1}/{siteStats.regression.cases} · {percent(siteStats.regression.top1, siteStats.regression.cases)}</dd></div><div><dt>Top 5</dt><dd>{siteStats.regression.top5}/{siteStats.regression.cases} · {percent(siteStats.regression.top5, siteStats.regression.cases)}</dd></div></dl>
          </article>
        </div>
        <div className="evidence-callout"><WarningCircle size={25} aria-hidden /><p><strong>Read this as “{describeRate(heldoutUnmentioned.top3HitRate ?? 0)},” not as two significant figures.</strong> With {heldoutUnmentioned.cases} held-out cases in this cohort, one result changing moves Top-3 by roughly {Math.round(100 / heldoutUnmentioned.cases)} points. The 95% interval is {Math.round((heldoutUnmentioned.intervals95.top3?.[0] ?? 0) * 100)}–{Math.round((heldoutUnmentioned.intervals95.top3?.[1] ?? 0) * 100)}%.</p></div>
      </section>

      <section className="section page-shell">
        <div className="section-heading split-heading">
          <div><p className="eyebrow">Cohorts</p><h2>Some tasks already contained their answer.</h2></div>
          <p>
            {heldoutMentioned.cases} of the {siteStats.heldout.cases} held-out tasks name a fixing file
            outright — one as <code>Location: lib/document.js:2339</code>, two as a GitHub permalink to
            the exact lines. A ranker that reads explicit file mentions answers those by reading the
            task. Pooling them lets {heldoutMentioned.cases} cases carry the headline, so they are
            reported separately.
          </p>
        </div>
        <div className="results-table" role="table" aria-label="Held-out results split by whether the task named the fixing file">
          <div className="results-row results-head" role="row"><span role="columnheader">Cohort</span><span role="columnheader">Cases</span><span role="columnheader">Top 1</span><span role="columnheader">Top 3</span></div>
          <div className="results-row" role="row"><span role="cell">Task did not name the file</span><span role="cell">{heldoutUnmentioned.cases}</span><span role="cell">{rate(heldoutUnmentioned.top1HitRate)}</span><span role="cell">{rate(heldoutUnmentioned.top3HitRate)}</span></div>
          <div className="results-row" role="row"><span role="cell">Task named the file</span><span role="cell">{heldoutMentioned.cases}</span><span role="cell">{rate(heldoutMentioned.top1HitRate)}</span><span role="cell">{rate(heldoutMentioned.top3HitRate)}</span></div>
          <div className="results-row" role="row"><span role="cell">Pooled — what we published before</span><span role="cell">{siteStats.heldout.cases}</span><span role="cell">{percent(siteStats.heldout.top1, siteStats.heldout.cases)}</span><span role="cell">{percent(siteStats.heldout.top3, siteStats.heldout.cases)}</span></div>
        </div>
        <div className="evidence-callout"><WarningCircle size={25} aria-hidden /><p><strong>This is a structural correction, not a measured effect size.</strong> The regression suite barely moves under the same split, and its named cases are 2 of 3 rather than 3 of 3 — being named does not guarantee a hit. With three cases per named cohort, how much a mention is worth is not established. What is established is that a generalization headline should not be computed over tasks that contain their own answer.</p></div>
      </section>

      <section className="section page-shell">
        <div className="section-heading split-heading">
          <div><p className="eyebrow">Baselines</p><h2>Better than searching the repository?</h2></div>
          <p>
            A ranked list only earns its place if it beats what an agent already gets for free. Every
            arm below scores on <strong>the same repository scan</strong> — same files, same text
            samples. Each baseline is shown at its <strong>strongest</strong> candidate policy:
            pointed at every scanned file a keyword search just returns <code>README.md</code>, which
            would make this a strawman rather than a comparison.
          </p>
        </div>
        <div className="results-table" role="table" aria-label="FixMap against naive retrieval baselines on held-out cases that did not name the file">
          <div className="results-row results-head" role="row"><span role="columnheader">Arm</span><span role="columnheader">Top 1</span><span role="columnheader">Top 3</span><span role="columnheader">Top 5</span></div>
          <div className="results-row" role="row"><span role="cell">Path extraction — read paths out of the task</span><span role="cell">{rate(heldoutBaselines.pathExtraction.top1HitRate)}</span><span role="cell">{rate(heldoutBaselines.pathExtraction.top3HitRate)}</span><span role="cell">{rate(heldoutBaselines.pathExtraction.top5HitRate)}</span></div>
          <div className="results-row" role="row"><span role="cell">Literal keyword search, code files only</span><span role="cell">{rate(heldoutBaselines.lexical.top1HitRate)}</span><span role="cell">{rate(heldoutBaselines.lexical.top3HitRate)}</span><span role="cell">{rate(heldoutBaselines.lexical.top5HitRate)}</span></div>
          <div className="results-row" role="row"><span role="cell"><strong>BM25 retrieval, code files only</strong></span><span role="cell"><strong>{rate(heldoutBaselines.bm25.top1HitRate)}</strong></span><span role="cell"><strong>{rate(heldoutBaselines.bm25.top3HitRate)}</strong></span><span role="cell"><strong>{rate(heldoutBaselines.bm25.top5HitRate)}</strong></span></div>
          <div className="results-row" role="row"><span role="cell">FixMap</span><span role="cell">{rate(heldoutBaselines.fixmap.top1HitRate)}</span><span role="cell">{rate(heldoutBaselines.fixmap.top3HitRate)}</span><span role="cell">{rate(heldoutBaselines.fixmap.top5HitRate)}</span></div>
        </div>
        <div className="evidence-callout"><WarningCircle size={25} aria-hidden /><p><strong>FixMap does not beat BM25 over code files on repositories it was never tuned against.</strong> Top 1 and Top 3 are exact ties — a paired McNemar exact test puts both at p = 1.0, with two disagreements each way. At Top 5 the baseline wins three cases FixMap misses and FixMap wins none: BM25 has the fixing file in its top five for 9 of 9 of these cases, FixMap for 6 of 9. FixMap does lead on the regression suite (69% vs 39% Top 1), but that is the suite whose cases shaped the ranker, and even there the lead is not significant against this baseline. We publish this because it is what the measurement says; closing the Top-5 recall gap is the next piece of work.</p></div>
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
                <code role="cell">{result.top5Paths[0]}</code>
                <span role="cell" className={result.top3Hit ? "result-hit" : "result-miss"}>{result.top3Hit ? <Check size={18} weight="bold" aria-hidden /> : <Minus size={18} weight="bold" aria-hidden />}{result.top3Hit ? "Hit" : "Miss"}</span>
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

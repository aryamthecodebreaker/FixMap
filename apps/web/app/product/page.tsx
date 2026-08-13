import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ChartLineUp,
  CheckCircle,
  Eye,
  FileMagnifyingGlass,
  Gauge,
  GitDiff,
  LockKey,
  Path,
  ShieldWarning
} from "@phosphor-icons/react/ssr";
import { ProductMap } from "../_components/product-map";

export const metadata: Metadata = {
  title: "How it works",
  description: "See how FixMap turns a software problem into ranked files, reachable checks, reviewable risks, and honest diagnostics.",
  alternates: { canonical: "/product" },
  openGraph: {
    title: "How FixMap works",
    description: "Plan, explain, compare, and verify with repository-grounded evidence.",
    url: "/product"
  }
};

const stages = [
  {
    id: "plan",
    number: "01",
    icon: FileMagnifyingGlass,
    eyebrow: "Before the edit",
    title: "Plan: find the few places that matter.",
    body: "FixMap reads the task and repository together. It ranks primary context, then builds a separate Impact Graph from imports, reverse dependents, routed tests, and repeated Git co-change evidence.",
    details: ["Ranked source files with reasons", "Impact files to inspect, not assumed edits", "Workspace-aware tests, risks, and diagnostics"]
  },
  {
    id: "context",
    number: "02",
    icon: FileMagnifyingGlass,
    eyebrow: "Before the agent reads",
    title: "Context: send the source, not just its address.",
    body: "Context packages deterministic line ranges from primary and impact files inside an estimated source-token budget. Every snippet keeps its role, reason, confidence, range, and truncation state.",
    details: ["Markdown or structured JSON", "Visible UTF-8 byte estimate", "Explicit omissions and scanner bounds"]
  },
  {
    id: "graph",
    number: "03",
    icon: Path,
    eyebrow: "When relationships matter",
    title: "Graph: make the evidence portable.",
    body: "Graph exports the Impact Graph as Mermaid for review documents or versioned JSON for tools, preserving the direction and reason for every import, dependent, test, and co-change edge.",
    details: ["Mermaid or versioned JSON", "Directional relationships", "No invented dependencies"]
  },
  {
    id: "explain",
    number: "04",
    icon: Eye,
    eyebrow: "When the map surprises you",
    title: "Explain: ask why a file is missing.",
    body: "A ranked list explains what it chose. Explain handles the harder question: whether a path ranked lower, fell below the cutoff, was excluded intentionally, or never entered the scan.",
    details: ["Inspect one path directly", "Distinguish ranking from exclusion", "Surface scan-limit uncertainty"]
  },
  {
    id: "compare",
    number: "05",
    icon: Gauge,
    eyebrow: "When you refine the task",
    title: "Compare: check whether a better task moved the answer.",
    body: "Naming a symbol, an error string, or a path usually changes the ranking. Compare puts two plans side by side and reports what entered, left, moved, or changed confidence — so refining the task is measurable rather than a matter of impression.",
    details: ["Two plans, one delta", "Entered, left, moved, changed confidence", "Same report from CLI and MCP"]
  },
  {
    id: "verify",
    number: "07",
    icon: GitDiff,
    eyebrow: "After the edit",
    title: "Verify: compare the plan with the real change.",
    body: "FixMap checks the saved plan against a git diff. It points out unplanned files, untouched leading context, missing tests, risky areas, and recalculated impact around the files that actually changed.",
    details: ["Plan versus diff", "Recalculated impact", "Advisory findings by default"]
  }
];

export default function ProductPage() {
  return (
    <main>
      <section className="subpage-hero page-shell">
        <p className="eyebrow">The product</p>
        <h1>One problem.{" "}<br /><em>A map that stays useful.</em></h1>
        <p>
          FixMap narrows the first step, explains its reasoning, and checks the work that followed.
          It is a map you can inspect—not a promise that the map is always right.
        </p>
        <div className="button-row">
          <Link className="button primary" href="/demo">Try a live example <ArrowRight size={18} weight="bold" aria-hidden /></Link>
          <Link className="button secondary" href="/get-started">Get started</Link>
        </div>
      </section>

      <section className="section page-shell" id="benchmark">
        <div className="section-heading split-heading">
          <div><p className="eyebrow">Measure it locally</p><h2>Backtest the map on your own history.</h2></div>
          <p><code>fixmap benchmark --repo . --last 50</code> compares BM25-over-code, ordinary FixMap context, and FixMap with Impact Graph against historical parent snapshots.</p>
        </div>
        <div className="principle-grid">
          <article><ChartLineUp size={27} aria-hidden /><h3>One candidate corpus</h3><p>Every arm sees the same scanned files, so a weaker baseline is never manufactured by changing the search space.</p></article>
          <article><Gauge size={27} aria-hidden /><h3>Pre-change cutoff</h3><p>Each case is evaluated on its parent snapshot. The target change and later Git history cannot leak into its evidence.</p></article>
          <article><Eye size={27} aria-hidden /><h3>Raw cases included</h3><p>All, mentioned, and unmentioned cohorts plus Wilson intervals make misses and small samples visible.</p></article>
          <article><LockKey size={27} aria-hidden /><h3>No repository code runs</h3><p>The benchmark reads Git and source text in temporary worktrees without installing dependencies, running hooks, or executing tests.</p></article>
        </div>
      </section>

      <section className="section page-shell" id="watch">
        <div className="section-heading split-heading">
          <div><p className="eyebrow">While the agent edits</p><h2>Watch the implementation drift—or stay aligned.</h2></div>
          <p><code>fixmap watch --report plan.json --repo .</code> emits only when the working tree changes, then re-runs Verify and recalculates the Impact Graph around the real diff.</p>
        </div>
        <div className="principle-grid">
          <article><GitDiff size={27} aria-hidden /><h3>Changed states only</h3><p>A lightweight fingerprint avoids repeating full scans when nothing moved.</p></article>
          <article><Path size={27} aria-hidden /><h3>Drift made visible</h3><p>Unmapped edits, untouched leading context, and new impact relationships appear as evidence, not verdicts.</p></article>
          <article><CheckCircle size={27} aria-hidden /><h3>Agent-ready stream</h3><p>Markdown stays readable; JSON Lines gives automation one complete record per update.</p></article>
          <article><LockKey size={27} aria-hidden /><h3>Still local-only</h3><p>Watch reads Git and source text without running repository code, installing dependencies, or calling a model.</p></article>
        </div>
      </section>

      <section className="section page-shell product-map-section">
        <ProductMap />
      </section>

      <section className="section product-stages">
        <div className="page-shell">
          {stages.map(({ id, number, icon: Icon, eyebrow, title, body, details }) => (
            <article className="stage-row" id={id} key={id}>
              <div className="stage-index"><span>{number}</span><Icon size={30} aria-hidden /></div>
              <div className="stage-copy"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{body}</p></div>
              <ul>{details.map((detail) => <li key={detail}><CheckCircle size={19} weight="fill" aria-hidden />{detail}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className="section page-shell" id="tests">
        <div className="section-heading split-heading">
          <div><p className="eyebrow">What makes the map useful</p><h2>Grounded signals, not a black box.</h2></div>
          <p>FixMap is deterministic. Every ranking point comes from repository evidence that can be inspected and challenged.</p>
        </div>
        <div className="principle-grid">
          <article><Path size={27} aria-hidden /><h3>Repository connections</h3><p>Paths, imports, symbols, workspace boundaries, and related tests establish how code fits together.</p></article>
          <article><Gauge size={27} aria-hidden /><h3>Calibrated confidence</h3><p>Confidence is capped when evidence is thin. Vague tasks can return an empty map instead of a plausible guess.</p></article>
          <article id="risks"><ShieldWarning size={27} aria-hidden /><h3>Explicit uncertainty</h3><p>Scan limits, missing refs, generated files, and remote-fetch behavior appear as diagnostics rather than disappearing.</p></article>
          <article><LockKey size={27} aria-hidden /><h3>Safe by construction</h3><p>FixMap reads and ranks. It does not install dependencies, run scripts, execute tests, or upload local source.</p></article>
        </div>
      </section>

      <section className="section dark-section">
        <div className="page-shell product-boundary">
          <div><p className="eyebrow">The boundary matters</p><h2>A starting map, not proof.</h2></div>
          <div>
            <p>FixMap can help an agent search less and review more deliberately. It cannot prove a change is correct, complete, or safe.</p>
            <p>That is why every score has reasons, Verify is mostly advisory, and the benchmark page publishes failures alongside hits.</p>
            <Link className="button light" href="/evidence">See the evidence <ArrowRight size={18} weight="bold" aria-hidden /></Link>
          </div>
        </div>
      </section>
    </main>
  );
}

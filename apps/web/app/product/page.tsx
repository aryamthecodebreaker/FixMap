import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
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
  description: "See how FixMap turns a software problem into ranked files, reachable checks, reviewable risks, and honest diagnostics."
};

const stages = [
  {
    id: "plan",
    number: "01",
    icon: FileMagnifyingGlass,
    eyebrow: "Before the edit",
    title: "Plan: find the few places that matter.",
    body: "FixMap reads the task and the repository together. It ranks likely context files, attaches the evidence behind each score, and routes the nearest tests it can actually reach.",
    details: ["Ranked source files with reasons", "Workspace-aware test commands", "Risk areas and scan diagnostics"]
  },
  {
    id: "explain",
    number: "02",
    icon: Eye,
    eyebrow: "When the map surprises you",
    title: "Explain: ask why a file is missing.",
    body: "A ranked list explains what it chose. Explain handles the harder question: whether a path ranked lower, fell below the cutoff, was excluded intentionally, or never entered the scan.",
    details: ["Inspect one path directly", "Distinguish ranking from exclusion", "Surface scan-limit uncertainty"]
  },
  {
    id: "compare",
    number: "03",
    icon: Gauge,
    eyebrow: "When you refine the task",
    title: "Compare: check whether a better task moved the answer.",
    body: "Naming a symbol, an error string, or a path usually changes the ranking. Compare puts two plans side by side and reports what entered, left, moved, or changed confidence — so refining the task is measurable rather than a matter of impression.",
    details: ["Two plans, one delta", "Entered, left, moved, changed confidence", "Same report from CLI and MCP"]
  },
  {
    id: "verify",
    number: "04",
    icon: GitDiff,
    eyebrow: "After the edit",
    title: "Verify: compare the plan with the real change.",
    body: "FixMap checks the saved plan against a git diff. It points out unplanned files, untouched leading context, missing tests, risky areas, and edits in generated or retired locations.",
    details: ["Plan versus diff", "Advisory findings by default", "Non-zero only for discarded generated edits"]
  }
];

export default function ProductPage() {
  return (
    <main>
      <section className="subpage-hero page-shell">
        <p className="eyebrow">The product</p>
        <h1>One problem.<br /><em>Three useful answers.</em></h1>
        <p>
          FixMap narrows the first step, explains its reasoning, and checks the work that followed.
          It is a map you can inspect—not a promise that the map is always right.
        </p>
        <div className="button-row">
          <Link className="button primary" href="/demo">Try a live example <ArrowRight size={18} weight="bold" aria-hidden /></Link>
          <Link className="button secondary" href="/get-started">Get started</Link>
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

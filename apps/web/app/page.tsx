import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  GithubLogo,
  Laptop,
  LockKey,
  Path,
  Robot
} from "@phosphor-icons/react/ssr";
import { InteractiveMapStage } from "./_components/interactive-map-stage";
import { repoUrl, siteStats } from "./_lib/site-data";

const outcomes = [
  { number: "01", name: "Files to inspect first", detail: "See the source files most connected to the task, with a plain reason for every suggestion.", href: "/product#plan" },
  { number: "02", name: "Tests and checks to run", detail: "Find the nearest tests and package commands that can prove the change works.", href: "/product#tests" },
  { number: "03", name: "Risks worth reviewing", detail: "Spot sensitive areas and nearby files before a focused edit becomes an unexpected regression.", href: "/product#risks" }
];

const surfaces = [
  { icon: Robot, name: "Coding agent", detail: "Add /fixmap to Claude Code, Cursor, GitHub Copilot, or another supported agent.", href: "/get-started#agent" },
  { icon: Laptop, name: "Terminal", detail: "Run FixMap locally with one command and no account or API key.", href: "/get-started#terminal" },
  { icon: GithubLogo, name: "Pull requests", detail: "Post a FixMap report automatically whenever a pull request changes.", href: "/get-started#pull-requests" }
];

const heldoutUnmentioned = siteStats.heldout.cohorts.unmentioned;
const heldoutBaseline = siteStats.baselines.heldout;
const count = (rate: number | null, cases: number) => Math.round((rate ?? 0) * cases);

export default function HomePage() {
  return (
    <main className="pro-home">
      <section className="pro-hero page-shell">
        <div className="pro-hero-copy">
          <p className="eyebrow">Repository context for coding agents · FixMap v{siteStats.version}</p>
          <h1>Give your coding agent a map before it edits.</h1>
          <p className="pro-hero-lede">
            Give FixMap a coding task and a repository. It returns focused files to inspect,
            relevant tests and checks, and nearby impact or risks—before the agent starts changing code.
          </p>
          <div className="button-row">
            <Link className="button primary" href="/demo">Try a real example <ArrowRight size={17} weight="bold" aria-hidden /></Link>
            <Link className="button secondary" href="/get-started">Install for your agent</Link>
          </div>
          <div className="pro-trust-line" role="group" aria-label="FixMap trust facts">
            <span><LockKey size={16} aria-hidden /> Local-first</span>
            <span><CheckCircle size={16} aria-hidden /> No API key</span>
            <span><GithubLogo size={16} aria-hidden /> MIT licensed</span>
          </div>
          <a className="pro-overview-link" href="#overview">Prefer a walkthrough? Watch the 32-second overview.</a>
        </div>
        <InteractiveMapStage />
      </section>

      <section className="pro-workflow page-shell">
        <div className="pro-section-heading">
          <p className="eyebrow">One task. Three useful answers.</p>
          <h2>Know what to open, run, and review.</h2>
          <p>FixMap narrows the first investigation without pretending it already knows the fix.</p>
        </div>
        <div className="pro-workflow-list">
          {outcomes.map((item) => (
            <Link href={item.href} key={item.number}>
              <span>{item.number}</span>
              <strong>{item.name}</strong>
              <p>{item.detail}</p>
              <ArrowRight size={18} weight="bold" aria-hidden />
            </Link>
          ))}
        </div>
      </section>

      <section className="pro-proof">
        <div className="page-shell pro-proof-inner">
          <div>
            <p className="eyebrow">Evidence, with boundaries</p>
            <h2>What FixMap has—and has not—proven.</h2>
            <p>Repository retrieval is measured. Agent efficiency is not. The site keeps those claims separate.</p>
            <Link className="text-link" href="/evidence">See every benchmark case <ArrowRight size={17} weight="bold" aria-hidden /></Link>
          </div>
          <div className="pro-proof-boundaries">
            <article>
              <span>Measured</span>
              <strong>{count(heldoutUnmentioned.top3HitRate, heldoutUnmentioned.cases)}/{heldoutUnmentioned.cases} held-out tasks surfaced the fixing file in the top 3.</strong>
              <p>BM25 over the same code corpus tied Top-3 and reached {count(heldoutBaseline.bm25.top5HitRate, heldoutBaseline.bm25.cases)}/{heldoutBaseline.bm25.cases} at Top-5 versus {count(heldoutBaseline.fixmap.top5HitRate, heldoutBaseline.fixmap.cases)}/{heldoutBaseline.fixmap.cases} for FixMap.</p>
            </article>
            <article>
              <span>Mechanism</span>
              <strong>FixMap ranks files, routes checks, and maps likely impact.</strong>
              <p>Its evidence comes from repository paths, symbols, imports, related tests, and bounded Git co-change history.</p>
            </article>
            <article>
              <span>Not yet measured</span>
              <strong>Token, cost, time, tool-call, and task-success improvements.</strong>
              <p>A controlled agent-study protocol exists, but there are no completed runs to support those outcome claims.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="pro-surfaces page-shell">
        <div className="pro-section-heading">
          <p className="eyebrow">Choose your setup</p>
          <h2>Use FixMap where your work already starts.</h2>
        </div>
        <div className="pro-surface-grid">
          {surfaces.map(({ icon: Icon, ...surface }) => (
            <Link href={surface.href} key={surface.name}>
              <Icon size={21} aria-hidden />
              <h3>{surface.name}</h3>
              <p>{surface.detail}</p>
              <span>Set up <ArrowRight size={15} weight="bold" aria-hidden /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="pro-overview page-shell" id="overview" aria-labelledby="pro-overview-title">
        <div className="pro-section-heading">
          <p className="eyebrow">Optional overview</p>
          <h2 id="pro-overview-title">See FixMap in a full workflow.</h2>
          <p>A short walkthrough from task to focused repository context.</p>
        </div>
        <details>
          <summary>Watch the 32-second overview <ArrowRight size={17} weight="bold" aria-hidden /></summary>
          <video controls playsInline preload="metadata" poster="/fixmap-launch-poster.jpg" aria-label="FixMap product overview film">
            <source src="/fixmap-launch.mp4" type="video/mp4" />
            <a href="/fixmap-launch.mp4">Download the FixMap product overview film.</a>
          </video>
        </details>
      </section>

      <section className="pro-final page-shell">
        <div><Path size={22} aria-hidden /><strong>Ready to give the next change a better start?</strong><span>Try it once or install it for your coding agent.</span></div>
        <div className="button-row">
          <Link className="button primary" href="/get-started">Get started <ArrowRight size={17} weight="bold" aria-hidden /></Link>
          <a className="text-link" href={repoUrl}><GithubLogo size={17} weight="fill" aria-hidden /> View source</a>
        </div>
      </section>
    </main>
  );
}

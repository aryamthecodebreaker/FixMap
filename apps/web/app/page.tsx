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
  { number: "01", name: "Files to check first", detail: "See which files best match the problem and why FixMap picked them.", href: "/product#plan" },
  { number: "02", name: "Tests to run", detail: "See the closest tests and the commands that run them.", href: "/product#tests" },
  { number: "03", name: "Other code to review", detail: "See nearby code and sensitive areas that may need a careful look.", href: "/product#risks" }
];

const surfaces = [
  { icon: Robot, name: "Inside your AI coding tool", detail: "Type /fixmap in Claude Code, Cursor, GitHub Copilot, or another supported tool.", href: "/get-started#agent" },
  { icon: Laptop, name: "In your terminal", detail: "Run one command on your computer. No account or API key is needed.", href: "/get-started#terminal" },
  { icon: GithubLogo, name: "On pull requests", detail: "Add a FixMap report whenever a pull request changes.", href: "/get-started#pull-requests" }
];

const heldoutUnmentioned = siteStats.heldout.cohorts.unmentioned;
const heldoutBaseline = siteStats.baselines.heldout;
const count = (rate: number | null, cases: number) => Math.round((rate ?? 0) * cases);

export default function HomePage() {
  return (
    <main className="pro-home">
      <section className="pro-hero page-shell">
        <div className="pro-hero-copy">
          <h1>FixMap tells AI coding tools which files to check first.</h1>
          <p className="pro-hero-lede">
            You describe what is broken. FixMap checks the project and gives Codex, Claude Code,
            or Cursor a short list: files to open, tests to run, and other code to review.
          </p>
          <div className="button-row">
            <Link className="button primary" href="/demo">Try it with a sample project <ArrowRight size={17} weight="bold" aria-hidden /></Link>
            <Link className="button secondary" href="/get-started">Use it on my project</Link>
          </div>
          <div className="pro-trust-line" role="group" aria-label="FixMap trust facts">
            <span><LockKey size={16} aria-hidden /> Runs on your computer</span>
            <span><CheckCircle size={16} aria-hidden /> No API key</span>
            <span><GithubLogo size={16} aria-hidden /> Free and open source</span>
          </div>
          <a className="pro-overview-link" href="#overview">Want to see it once? Watch the 31-second video.</a>
        </div>
        <InteractiveMapStage />
      </section>

      <section className="pro-workflow page-shell">
        <div className="pro-section-heading">
          <h2>FixMap makes a simple starting list.</h2>
          <p>It does not write the fix. It helps the AI tool know where to look first.</p>
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
            <h2>What we know. What we do not know yet.</h2>
            <p>We tested whether FixMap finds the right files. We have not proved that coding agents finish faster or use fewer tokens.</p>
            <Link className="text-link" href="/evidence">See every test case <ArrowRight size={17} weight="bold" aria-hidden /></Link>
          </div>
          <div className="pro-proof-boundaries">
            <article>
              <span>Tested</span>
              <strong>{count(heldoutUnmentioned.top3HitRate, heldoutUnmentioned.cases)}/{heldoutUnmentioned.cases} held-out tasks put the fixing file in the first 3 results.</strong>
              <p>A simpler BM25 search tied FixMap in the Top-3 test. At Top-5, BM25 found {count(heldoutBaseline.bm25.top5HitRate, heldoutBaseline.bm25.cases)}/{heldoutBaseline.bm25.cases}; FixMap found {count(heldoutBaseline.fixmap.top5HitRate, heldoutBaseline.fixmap.cases)}/{heldoutBaseline.fixmap.cases}.</p>
            </article>
            <article>
              <span>How it works</span>
              <strong>FixMap looks for clues in the project, then builds the list.</strong>
              <p>It uses file names, code words, imports, nearby tests, and a limited amount of Git history.</p>
            </article>
            <article>
              <span>Not tested yet</span>
              <strong>Whether FixMap saves time, tokens, money, or tool calls—or improves task success.</strong>
              <p>The study plan exists, but no completed runs support those claims yet.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="pro-surfaces page-shell">
        <div className="pro-section-heading">
          <h2>Pick the easiest way to use FixMap.</h2>
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
          <h2 id="pro-overview-title">Watch one full example.</h2>
          <p>See a coding problem turn into a short list of files, tests, and related code.</p>
        </div>
        <details>
          <summary>Play the 31-second video <ArrowRight size={17} weight="bold" aria-hidden /></summary>
          <video controls playsInline preload="metadata" poster="/fixmap-launch-poster.jpg" aria-label="FixMap product overview film">
            <source src="/fixmap-launch.mp4" type="video/mp4" />
            <a href="/fixmap-launch.mp4">Download the FixMap product overview film.</a>
          </video>
        </details>
      </section>

      <section className="pro-final page-shell">
        <div><Path size={22} aria-hidden /><strong>Want your AI coding tool to know where to start?</strong><span>Try the sample or use FixMap on your project.</span></div>
        <div className="button-row">
          <Link className="button primary" href="/get-started">Get started <ArrowRight size={17} weight="bold" aria-hidden /></Link>
          <a className="text-link" href={repoUrl}><GithubLogo size={17} weight="fill" aria-hidden /> View source</a>
        </div>
      </section>
    </main>
  );
}

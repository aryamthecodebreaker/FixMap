import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  GithubLogo,
  Laptop,
  LockKey,
  MagnifyingGlass,
  Path,
  ShieldCheck
} from "@phosphor-icons/react/ssr";
import { CopyCommand } from "./_components/copy-command";
import { InteractiveMapStage } from "./_components/interactive-map-stage";
import { PixelSinkSurface } from "./_components/pixel-sink-surface";
import { commands, repoUrl, siteStats } from "./_lib/site-data";

const answers = [
  {
    number: "01",
    title: "Files to inspect",
    body: "FixMap ranks the source files most connected to the problem and tells you why each one surfaced.",
    href: "/product#plan"
  },
  {
    number: "02",
    title: "Checks to run",
    body: "It traces the nearest package commands and tests that can prove the change in your environment.",
    href: "/product#tests"
  },
  {
    number: "03",
    title: "Risks to review",
    body: "It calls out sensitive paths and uncertainty before a plausible edit becomes a surprising regression.",
    href: "/product#risks"
  }
];

const paths = [
  { name: "CLI", detail: "Describe a task or point at a diff.", href: "/get-started#cli" },
  { name: "MCP", detail: "Give coding agents Plan, Explain, Compare, Verify, and Doctor.", href: "/get-started#mcp" },
  { name: "GitHub Action", detail: "Map every pull request automatically.", href: "/get-started#action" }
];

export default function HomePage() {
  return (
    <main className="premium-home">
      <section className="premium-hero-surface pixel-sink-host">
        <PixelSinkSurface />
        <div className="premium-hero page-shell">
          <div className="premium-hero-copy">
            <p className="eyebrow">Open source · Local first · No API key</p>
            <h1>Know where<br />to <em>start.</em></h1>
            <p className="premium-hero-lede">
              FixMap turns a software problem into a focused map of files, checks, and risks—so
              you can investigate with confidence before you change anything.
            </p>
            <p className="preset-note"><strong>v{siteStats.version} workflow:</strong> Compare plans · focus with exclude/limit · map a working tree · verify the change · diagnose installs.</p>
            <div className="button-row premium-hero-actions">
              <Link className="button primary" href="/demo">Try FixMap <ArrowRight size={18} weight="bold" aria-hidden /></Link>
              <Link className="button secondary" href="/product">See how it works <ArrowRight size={18} weight="bold" aria-hidden /></Link>
            </div>
            <div className="premium-trust-facts" aria-label="FixMap trust facts">
              <span><LockKey size={23} aria-hidden /><b>Open source</b><small>MIT licensed</small></span>
              <span><Laptop size={23} aria-hidden /><b>Runs locally</b><small>Your code stays with you</small></span>
              <span><ShieldCheck size={23} aria-hidden /><b>No account</b><small>No signup. No tracking.</small></span>
              <span><MagnifyingGlass size={23} aria-hidden /><b>No API key</b><small>Bring your own context</small></span>
            </div>
          </div>
          <InteractiveMapStage />
        </div>
      </section>

      <section className="premium-story pixel-sink-host">
        <PixelSinkSurface />
        <div className="premium-story-inner page-shell">
          <div className="story-rail" aria-label="How FixMap works">
            <span className="active"><i>1</i>Understand</span>
            <span><i>2</i>Validate</span>
            <span><i>3</i>Investigate</span>
          </div>
          <div className="story-title">
            <p className="eyebrow">How the map forms</p>
            <h2>From vague issue<br />to clear <em>first move.</em></h2>
          </div>
          <div className="story-copy">
            <p>FixMap reads how the repository connects, then surfaces the places that matter, the checks that can prove the change, and the risks worth keeping in mind.</p>
            <a className="text-link" href="#answers">Scroll to see how it works <ArrowRight size={16} weight="bold" aria-hidden /></a>
          </div>
          <Image className="story-landscape" src="/fixmap-route-landscape.png" alt="A layered route arriving at a green destination marker" width={1536} height={1024} sizes="(max-width: 900px) 100vw, 48vw" loading="eager" unoptimized />
        </div>
      </section>

      <section className="premium-answers page-shell" id="answers">
        <div className="premium-section-intro">
          <p className="eyebrow">One problem. Three useful answers.</p>
          <h2>Less searching.<br />More knowing.</h2>
          <p>Every result is evidence you can inspect—not a mysterious instruction to trust.</p>
        </div>
        <div className="premium-answer-list">
          {answers.map((answer) => (
            <Link key={answer.number} href={answer.href}>
              <span>{answer.number}</span>
              <div><h3>{answer.title}</h3><p>{answer.body}</p></div>
              <ArrowRight size={24} weight="bold" aria-hidden />
            </Link>
          ))}
        </div>
      </section>

      <section className="premium-proof">
        <div className="page-shell premium-proof-inner">
          <div className="premium-proof-copy">
            <p className="eyebrow">Measured, not asserted</p>
            <h2>A useful starting map.<br /><em>Never false certainty.</em></h2>
            <p>FixMap publishes the misses alongside the wins. It narrows the search, exposes uncertainty, and leaves the final judgment with you.</p>
            <Link className="button light" href="/evidence">Read the evidence <ArrowRight size={18} weight="bold" aria-hidden /></Link>
          </div>
          <div className="premium-proof-metrics">
            <div><strong>{siteStats.heldout.top3}/{siteStats.heldout.cases}</strong><span>held-out fixes surfaced in the top three</span></div>
            <div><strong>{siteStats.medianSeconds}s</strong><span>median scan and rank</span></div>
            <div><strong>0</strong><span>false-confidence findings in adversarial cases</span></div>
          </div>
        </div>
      </section>

      <section className="premium-paths page-shell">
        <div className="premium-section-intro compact">
          <p className="eyebrow">Use it where work begins</p>
          <h2>One map.<br />Three ways in.</h2>
        </div>
        <div className="premium-path-grid">
          {paths.map((path, index) => (
            <Link href={path.href} key={path.name}>
              <span>0{index + 1}</span><Path size={26} aria-hidden /><h3>{path.name}</h3><p>{path.detail}</p><ArrowRight size={20} weight="bold" aria-hidden />
            </Link>
          ))}
        </div>
      </section>

      <section className="premium-final page-shell">
        <div>
          <p className="eyebrow">Thirty-second start</p>
          <h2>Give the next change<br />a clear place to begin.</h2>
          <p>One command. No account. No API key.</p>
        </div>
        <div className="premium-final-action">
          <CopyCommand command={commands.publicIssue} />
          <div className="button-row">
            <Link className="button primary" href="/get-started">Get started <ArrowRight size={18} weight="bold" aria-hidden /></Link>
            <a className="text-link" href={repoUrl}><GithubLogo size={18} weight="fill" aria-hidden /> View on GitHub</a>
          </div>
          <span><CheckCircle size={18} weight="fill" aria-hidden /> FixMap v{siteStats.version}</span>
        </div>
      </section>
    </main>
  );
}

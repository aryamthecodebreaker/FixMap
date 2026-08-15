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

export default function HomePage() {
  return (
    <main className="pro-home">
      <section className="pro-hero page-shell">
        <div className="pro-hero-copy">
          <p className="eyebrow">For developers and coding agents · FixMap v{siteStats.version}</p>
          <h1>Stop searching the repository blindly.</h1>
          <p className="pro-hero-lede">
            Give FixMap a task. It shows you and your coding agent the files to inspect, the tests
            to run, and the risks to review before anything is edited.
          </p>
          <div className="button-row">
            <a className="button primary" href="#comparison">Watch the 32-second comparison <ArrowRight size={17} weight="bold" aria-hidden /></a>
            <Link className="button secondary" href="/demo">Try the live demo</Link>
          </div>
          <div className="pro-trust-line" role="group" aria-label="FixMap trust facts">
            <span><LockKey size={16} aria-hidden /> Local-first</span>
            <span><CheckCircle size={16} aria-hidden /> No API key</span>
            <span><GithubLogo size={16} aria-hidden /> MIT licensed</span>
          </div>
        </div>
        <InteractiveMapStage />
      </section>

      <section className="pro-film page-shell" id="comparison" aria-labelledby="pro-film-title">
        <div className="pro-section-heading">
          <p className="eyebrow">FixMap in 32 seconds</p>
          <h2 id="pro-film-title">Same issue. Better first move.</h2>
          <p>Watch one coding agent start with the right files and checks while the other searches the repository from scratch.</p>
          <Link className="text-link" href="/get-started">Install after the film <ArrowRight size={17} weight="bold" aria-hidden /></Link>
        </div>
        <video controls playsInline preload="metadata" poster="/fixmap-launch-poster.jpg" aria-label="FixMap agent comparison launch film">
          <source src="/fixmap-launch.mp4" type="video/mp4" />
          <a href="/fixmap-launch.mp4">Download the FixMap launch film.</a>
        </video>
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
            <p className="eyebrow">Measured in public</p>
            <h2>See the wins, the misses, and the limits.</h2>
            <p>FixMap publishes every benchmark case, explains what each number means, and makes uncertainty visible instead of hiding it behind a confidence label.</p>
            <Link className="text-link" href="/evidence">See every benchmark case <ArrowRight size={17} weight="bold" aria-hidden /></Link>
          </div>
          <dl className="pro-proof-metrics">
            <div><dt>Relevant fix surfaced in the first three suggestions</dt><dd>{siteStats.heldout.top3}/{siteStats.heldout.cases}</dd></div>
            <div><dt>Misleading or vague tasks handled without false confidence</dt><dd>{siteStats.adversarial.passed}/{siteStats.adversarial.cases}</dd></div>
            <div><dt>Median time to scan and rank the sample repositories</dt><dd>{siteStats.medianSeconds}s</dd></div>
          </dl>
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

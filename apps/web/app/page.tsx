import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  Command,
  GithubLogo,
  Laptop,
  LockKey,
  Path,
  ShieldCheck
} from "@phosphor-icons/react/ssr";
import { CopyCommand } from "./_components/copy-command";
import { InteractiveMapStage } from "./_components/interactive-map-stage";
import { commands, repoUrl, siteStats } from "./_lib/site-data";

const workflow = [
  { number: "01", name: "Plan", detail: "Rank the files, tests, and risks that matter before the first edit.", href: "/product#plan" },
  { number: "02", name: "Explain", detail: "Ask why a file ranked, missed the cutoff, was excluded, or was never scanned.", href: "/product#explain" },
  { number: "03", name: "Compare", detail: "Measure whether a clearer task produced a better context map.", href: "/product#compare" },
  { number: "04", name: "Verify", detail: "Check the completed diff against the plan that guided the work.", href: "/product#verify" }
];

const surfaces = [
  { icon: Command, name: "Slash command", detail: "Install /fixmap in supported coding agents and open the complete workflow menu.", href: "/get-started#slash-command" },
  { icon: Laptop, name: "CLI", detail: "Run locally in a terminal with no account or API key.", href: "/get-started#cli" },
  { icon: ShieldCheck, name: "MCP", detail: "Expose Plan, Explain, Compare, Verify, and Doctor to an agent.", href: "/get-started#mcp" },
  { icon: GithubLogo, name: "GitHub Action", detail: "Post the map or verify a saved plan on every pull request.", href: "/get-started#action" }
];

export default function HomePage() {
  return (
    <main className="pro-home">
      <section className="pro-hero page-shell">
        <div className="pro-hero-copy">
          <p className="eyebrow">FixMap v{siteStats.version} · open source repo intelligence</p>
          <h1>Start the change with evidence.</h1>
          <p className="pro-hero-lede">
            Give FixMap a task, issue, or diff. It returns the files to inspect, the checks to run,
            and the risks to review—with every recommendation tied to repository evidence.
          </p>
          <CopyCommand command={commands.publicIssue} />
          <div className="button-row">
            <Link className="button primary" href="/get-started">Install FixMap <ArrowRight size={17} weight="bold" aria-hidden /></Link>
            <Link className="button secondary" href="/demo">Open the live demo</Link>
          </div>
          <div className="pro-trust-line" role="group" aria-label="FixMap trust facts">
            <span><LockKey size={16} aria-hidden /> Local-first</span>
            <span><CheckCircle size={16} aria-hidden /> No API key</span>
            <span><GithubLogo size={16} aria-hidden /> MIT licensed</span>
          </div>
        </div>
        <InteractiveMapStage />
      </section>

      <section className="pro-workflow page-shell">
        <div className="pro-section-heading">
          <p className="eyebrow">One workflow</p>
          <h2>From task to verified diff.</h2>
          <p>Four focused steps, each inspectable on its own.</p>
        </div>
        <div className="pro-workflow-list">
          {workflow.map((item) => (
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
            <h2>Useful without pretending to be certain.</h2>
            <p>FixMap publishes the misses, the cohort boundaries, and the baseline comparison. A map narrows the search; it does not replace reading, tests, or review.</p>
            <Link className="text-link" href="/evidence">Read the benchmark methodology <ArrowRight size={17} weight="bold" aria-hidden /></Link>
          </div>
          <dl className="pro-proof-metrics">
            <div><dt>Held-out Top 3</dt><dd>{siteStats.heldout.top3}/{siteStats.heldout.cases}</dd></div>
            <div><dt>Adversarial gate</dt><dd>{siteStats.adversarial.passed}/{siteStats.adversarial.cases}</dd></div>
            <div><dt>Median scan</dt><dd>{siteStats.medianSeconds}s</dd></div>
          </dl>
        </div>
      </section>

      <section className="pro-surfaces page-shell">
        <div className="pro-section-heading">
          <p className="eyebrow">Use it where work starts</p>
          <h2>One engine. Four entry points.</h2>
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
        <div><Path size={22} aria-hidden /><strong>Ready to map a real task?</strong><span>No signup, cloud upload, or API key.</span></div>
        <div className="button-row">
          <Link className="button primary" href="/get-started">Get started <ArrowRight size={17} weight="bold" aria-hidden /></Link>
          <a className="text-link" href={repoUrl}><GithubLogo size={17} weight="fill" aria-hidden /> View source</a>
        </div>
      </section>
    </main>
  );
}

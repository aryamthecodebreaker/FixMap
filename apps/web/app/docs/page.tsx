import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BracketsCurly,
  CheckSquare,
  FileMagnifyingGlass,
  GithubLogo,
  Robot,
  WarningCircle
} from "@phosphor-icons/react/ssr";
import { CopyCommand } from "../_components/copy-command";
import { commands, repoUrl } from "../_lib/site-data";

export const metadata: Metadata = {
  title: "Documentation",
  description: "FixMap documentation for planning, explaining, verifying, JSON output, MCP, and GitHub Actions."
};

const docLinks = [
  { href: "#plan", icon: FileMagnifyingGlass, title: "Plan", body: "Map a task, issue, or diff." },
  { href: "#explain", icon: BracketsCurly, title: "Explain", body: "Ask why a path is missing." },
  { href: "#verify", icon: CheckSquare, title: "Verify", body: "Compare a plan with a diff." },
  { href: "#mcp", icon: Robot, title: "MCP", body: "Expose the full loop to agents." }
];

export default function DocsPage() {
  return (
    <main>
      <section className="subpage-hero compact-hero page-shell docs-hero">
        <p className="eyebrow">Documentation</p>
        <h1>Understand the map.<br /><em>Use it deliberately.</em></h1>
        <p>Start with the everyday workflow, then go deeper into output formats, verification, automation, and trust boundaries.</p>
        <CopyCommand command={commands.publicIssue} />
      </section>

      <section className="docs-layout page-shell">
        <aside className="docs-sidebar" aria-label="Documentation sections">
          <strong>On this page</strong>
          <a href="#plan">Plan</a><a href="#explain">Explain</a><a href="#focus">Focus</a><a href="#verify">Verify</a><a href="#output">Output</a><a href="#mcp">MCP</a><a href="#doctor">Doctor</a><a href="#safety">Safety</a>
        </aside>
        <div className="docs-content">
          <div className="docs-cards">
            {docLinks.map(({ href, icon: Icon, title, body }) => <a href={href} key={href}><Icon size={25} aria-hidden /><strong>{title}</strong><span>{body}</span><ArrowRight size={17} aria-hidden /></a>)}
          </div>

          <section id="plan" className="doc-section"><p className="eyebrow">Plan</p><h2>Find the right place to start.</h2><p>Give FixMap one task source: plain issue text, a task file, stdin, a public GitHub issue URL, or a git diff.</p><CopyCommand command={commands.localTask} /><h3>Public issue URL</h3><CopyCommand command={commands.publicIssue} /><h3>Working-tree or branch diff</h3><CopyCommand command={commands.diff} /><p>Remote repository mode is issue-only. Clone the repository locally when you need <code>--diff</code>, <code>--base</code>, or <code>--head</code>.</p></section>

          <section id="explain" className="doc-section"><p className="eyebrow">Explain</p><h2>Ask the missing-file question.</h2><p>Use <code>--explain</code> when you expected a path and it did not appear. The response distinguishes five different situations:</p><ul><li>The file ranked, just lower than expected.</li><li>It scored below the report cutoff.</li><li>It tied for a reported place but fell outside <code>--limit</code>.</li><li>It was excluded intentionally, such as a generated file whose source ranked instead.</li><li>The scanner never saw it, including a scan limit, a sparse checkout, or an unsupported extension.</li></ul><CopyCommand command={'npx -y @aryam/fixmap@latest plan --issue "reset links fail" --explain src/auth/token.ts'} /></section>

          <section id="focus" className="doc-section"><p className="eyebrow">Focus</p><h2>Narrow the map to what matters.</h2><p>Demo pages, marketing copy, and documentation often contain every symptom word a product documents, so they compete with the implementation. FixMap knows about conventions like <code>examples/</code>; it cannot know your repository&rsquo;s own layout.</p><CopyCommand command={'npx -y @aryam/fixmap@latest plan --issue "reset links fail" --exclude apps/web --limit 3'} /><p>Patterns can also live in a <code>.fixmapignore</code> file at the repository root, one per line. The two combine, and <code>--explain</code> reports an excluded file as excluded, naming the pattern that matched.</p><h3>Map what you are editing now</h3><CopyCommand command={'npx -y @aryam/fixmap@latest plan --working-tree --issue "reset flow"'} /><p>That means staged and unstaged tracked changes against <code>HEAD</code>. Untracked files stay out of the <em>change set</em> unless you add <code>--include-untracked</code>, so scratch metadata is not reported as an edit. They remain ranking candidates either way — a file an agent just wrote is usually the most relevant thing in the repository.</p><h3>Measure a better task</h3><p>Refine the wording, re-plan, and see whether the real file moved up:</p><CopyCommand command={'npx -y @aryam/fixmap@latest plan --issue "TOKEN_TTL_MINUTES is ignored" --compare before.json'} /></section>

          <section id="verify" className="doc-section"><p className="eyebrow">Verify</p><h2>Compare the plan with the change.</h2><p>Save a JSON plan before editing, then compare it with the real diff afterwards.</p><CopyCommand command={'npx -y @aryam/fixmap@latest plan --issue "reset links fail" --format json --output fixmap-report.json'} /><CopyCommand command={commands.verify} /><div className="doc-note"><WarningCircle size={22} aria-hidden /><p>Verify does not run tests or judge correctness. Most findings are advisory because the plan can be wrong and the change can still be right.</p></div></section>

          <section id="output" className="doc-section"><p className="eyebrow">Output</p><h2>Readable by people and tools.</h2><p>Markdown is the default handoff. Add <code>--format json</code> for structured output and <code>--output &lt;path&gt;</code> to save it.</p><div className="definition-list"><div><strong>Context files</strong><p>Ranked paths, scores, confidence labels, and evidence.</p></div><div><strong>Test routes</strong><p>Workspace-aware commands and reachable related tests.</p></div><div><strong>Risks</strong><p>Sensitive areas inferred from paths, symbols, and changes.</p></div><div><strong>Diagnostics</strong><p>Vague tasks, unresolved identifiers, scan limits, and other uncertainty.</p></div></div></section>

          <section id="mcp" className="doc-section"><p className="eyebrow">MCP</p><h2>Five tools for the agent workflow.</h2><p><code>fixmap_plan</code> maps tasks and working trees. <code>fixmap_explain</code> answers why a file is missing. <code>fixmap_compare</code> measures task refinement. <code>fixmap_verify</code> checks the later diff, and <code>fixmap_doctor</code> diagnoses install shadows. All five run locally over stdio.</p><CopyCommand command={commands.mcp} /><Link className="text-link" href="/get-started#mcp">MCP setup examples <ArrowRight size={17} weight="bold" aria-hidden /></Link></section>

          <section id="doctor" className="doc-section"><p className="eyebrow">Doctor</p><h2>Check you are running what you asked for.</h2><p>An older global install can shadow the version npm was asked for, so a feature that shipped appears not to exist. <code>doctor</code> reports the running version, the resolved path, any conflicting global, and the Node version.</p><CopyCommand command="npx -y @aryam/fixmap@latest doctor" /><p>It exits non-zero when it finds a shadow, so a CI step fails rather than reading on.</p></section>

          <section id="safety" className="doc-section"><p className="eyebrow">Safety and trust</p><h2>What FixMap will not do.</h2><ul><li>It does not install dependencies.</li><li>It does not run package scripts, builds, tests, or git hooks.</li><li>It does not upload local repository source.</li><li>It does not call a hosted model.</li><li>It does not claim the ranking proves a change is correct.</li></ul><a className="text-link" href={`${repoUrl}/blob/main/SECURITY.md`}>Read the security policy <ArrowRight size={17} weight="bold" aria-hidden /></a></section>
        </div>
      </section>

      <section className="section dark-section"><div className="page-shell docs-bottom"><div><GithubLogo size={32} weight="fill" aria-hidden /><h2>Every detail is open for inspection.</h2><p>Read the source, reproduce the benchmarks, or report a ranking that surprised you.</p></div><a className="button light" href={repoUrl}>Open FixMap on GitHub <ArrowRight size={18} weight="bold" aria-hidden /></a></div></section>
    </main>
  );
}

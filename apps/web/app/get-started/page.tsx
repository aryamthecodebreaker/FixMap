import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, GithubLogo, Robot, TerminalWindow } from "@phosphor-icons/react/ssr";
import { CopyCommand } from "../_components/copy-command";
import { commands, marketplaceUrl, repoUrl, siteStats } from "../_lib/site-data";

export const metadata: Metadata = {
  title: "Get started",
  description: "Run FixMap from the CLI, connect it through MCP, or add it to pull requests with the GitHub Action."
};

export default function GetStartedPage() {
  return (
    <main>
      <section className="subpage-hero page-shell">
        <p className="eyebrow">Get started</p>
        <h1>Choose where the map <em>should appear.</em></h1>
        <p>Use one command yourself, let a compatible coding agent request the map, or publish it automatically on pull requests.</p>
        <div className="jump-links"><a href="#cli">CLI</a><a href="#mcp">MCP</a><a href="#action">GitHub Action</a></div>
      </section>

      <section className="setup-section page-shell" id="cli">
        <div className="setup-heading"><span>01</span><TerminalWindow size={34} aria-hidden /><div><p className="eyebrow">CLI</p><h2>Run one command.</h2></div></div>
        <div className="setup-content">
          <p className="setup-lede">The fastest path. Paste a public GitHub issue URL and FixMap fetches the task, infers the repository, scans a temporary checkout, and removes it when the report is done.</p>
          <CopyCommand command={commands.publicIssue} />
          <h3>Or work inside a local repository</h3>
          <CopyCommand command={commands.localTask} />
          <CopyCommand command={commands.diff} />
          <p className="small-note">Requires Node.js 20.11 or newer. <code>npx</code> runs the package without a permanent global install.</p>
        </div>
      </section>

      <section className="setup-section page-shell" id="mcp">
        <div className="setup-heading"><span>02</span><Robot size={34} aria-hidden /><div><p className="eyebrow">MCP</p><h2>Let the agent ask.</h2></div></div>
        <div className="setup-content">
          <p className="setup-lede">FixMap exposes three local stdio tools: <code>fixmap_plan</code> before editing, <code>fixmap_explain</code> when a file you expected is missing from the map, and <code>fixmap_verify</code> after the diff exists.</p>
          <h3>Claude Code</h3>
          <CopyCommand command="claude mcp add fixmap -- npx -y @aryam/fixmap@latest mcp" />
          <h3>Cursor, Windsurf, and other MCP clients</h3>
          <pre className="code-block"><code>{`{
  "mcpServers": {
    "fixmap": {
      "command": "npx",
      "args": ["-y", "@aryam/fixmap@latest", "mcp"]
    }
  }
}`}</code></pre>
          <p className="small-note">Analysis runs locally over stdio. FixMap does not send repository source to a hosted model or service.</p>
        </div>
      </section>

      <section className="setup-section page-shell" id="action">
        <div className="setup-heading"><span>03</span><GithubLogo size={34} weight="fill" aria-hidden /><div><p className="eyebrow">GitHub Action</p><h2>Map every pull request.</h2></div></div>
        <div className="setup-content">
          <p className="setup-lede">The Action posts one report as a pull-request comment and writes the complete result to the job summary.</p>
          <pre className="code-block"><code>{`name: FixMap
on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  fixmap:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: aryamthecodebreaker/FixMap@v${siteStats.version}`}</code></pre>
          <div className="button-row"><a className="button primary" href={marketplaceUrl}>Install from Marketplace <ArrowRight size={18} weight="bold" aria-hidden /></a><a className="text-link" href={`${repoUrl}/blob/main/action.yml`}>View action source</a></div>
        </div>
      </section>

      <section className="section page-shell setup-next"><div><p className="eyebrow">Need the details?</p><h2>Read the command and output reference.</h2></div><Link className="button secondary" href="/docs">Open docs <ArrowRight size={18} weight="bold" aria-hidden /></Link></section>
    </main>
  );
}

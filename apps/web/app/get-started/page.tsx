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
        <p>Install the CLI once and use a short command, let a compatible coding agent request the map, or publish it automatically on pull requests.</p>
        <div className="jump-links"><a href="#cli">CLI</a><a href="#mcp">MCP</a><a href="#action">GitHub Action</a></div>
      </section>

      <section className="setup-section page-shell" id="cli">
        <div className="setup-heading"><span>01</span><TerminalWindow size={34} aria-hidden /><div><p className="eyebrow">CLI</p><h2>Install once. Keep the command short.</h2></div></div>
        <div className="setup-content">
          <p className="setup-lede">Install FixMap globally, then paste a public GitHub issue URL. FixMap fetches the task, infers the repository, scans a temporary checkout, and removes it when the report is done.</p>
          <CopyCommand command="npm install --global @aryam/fixmap@latest" />
          <CopyCommand command={commands.publicIssue} />
          <h3>Or work inside a local repository</h3>
          <CopyCommand command={commands.localTask} />
          <CopyCommand command={commands.diff} />

          <h3>Pin it to a project instead</h3>
          <p>Use a project dependency when everyone working on that repository should get the same version:</p>
          <CopyCommand command="npm install --save-dev @aryam/fixmap" />
          <p>A project install is reached with <code>npx fixmap</code> inside the repository, or from an npm script.</p>

          <h3>One-off trial without installing</h3>
          <CopyCommand command="npx -y @aryam/fixmap@latest plan --issue https://github.com/chalk/chalk/issues/624" />
          <p>If the current directory or one of its parents already contains FixMap, npm may deliberately choose that project-local binary. Check <code>--version</code>, or use the isolated-prefix test below when the exact package version matters.</p>

          <h3>Safe PowerShell test project</h3>
          <p>Create the directory before changing into it. If <code>cd</code> fails, PowerShell stays in the previous directory and a project-scoped npm install will go there instead.</p>
          <CopyCommand command={`$fixmapTestPath = Join-Path $env:USERPROFILE "fixmaptesting"
New-Item -ItemType Directory -Path $fixmapTestPath -Force -ErrorAction Stop | Out-Null
Set-Location $fixmapTestPath -ErrorAction Stop
npm init -y
npm install --save-dev @aryam/fixmap
npx fixmap --version
npx fixmap plan --issue "password reset emails fail"`} />
          <p>Use <code>Get-Location</code> before installing whenever a directory command reports an error.</p>

          <h3>Check what you are actually running</h3>
          <p>An older global install can shadow the version <code>npx</code> was asked for, which makes a feature that shipped look like it never existed. <code>doctor</code> reports the version in use, where it resolved from, and any conflicting global — and exits non-zero when it finds one:</p>
          <CopyCommand command="fixmap doctor" />
          <p>Doctor 0.8.4 and newer compares an exact npm-requested version when that newer Doctor is the process npm starts. An older project-local binary can win before the newer code starts, so treat the printed running version as authoritative. For an exact clean test, use the isolated-prefix/direct-shim procedure in the repository README.</p>

          <p className="small-note">Requires Node.js 20.11 or newer. No account, API key, or model call at any point.</p>
        </div>
      </section>

      <section className="setup-section page-shell" id="mcp">
        <div className="setup-heading"><span>02</span><Robot size={34} aria-hidden /><div><p className="eyebrow">MCP</p><h2>Let the agent ask.</h2></div></div>
        <div className="setup-content">
          <p className="setup-lede">FixMap exposes five local stdio tools: <code>fixmap_plan</code> before editing, <code>fixmap_explain</code> when a file is missing, <code>fixmap_compare</code> to measure a refined plan, <code>fixmap_verify</code> after the diff exists, and <code>fixmap_doctor</code> to diagnose install shadows.</p>
          <h3>Claude Code</h3>
          <CopyCommand command="claude mcp add fixmap -- fixmap mcp" />
          <h3>Cursor, Windsurf, and other MCP clients</h3>
          <pre className="code-block"><code>{`{
  "mcpServers": {
    "fixmap": {
      "command": "fixmap",
      "args": ["mcp"]
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
  issues: write
  pull-requests: write

jobs:
  fixmap:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - id: fixmap
        uses: aryamthecodebreaker/FixMap@v${siteStats.version}
        with:
          github-token: ${"$"}{{ secrets.GITHUB_TOKEN }}`}</code></pre>
          <div className="button-row"><a className="button primary" href={marketplaceUrl}>Install from Marketplace <ArrowRight size={18} weight="bold" aria-hidden /></a><a className="text-link" href={`${repoUrl}/blob/main/action.yml`}>View action source</a></div>
        </div>
      </section>

      <section className="section page-shell setup-next"><div><p className="eyebrow">Need the details?</p><h2>Read the command and output reference.</h2></div><Link className="button secondary" href="/docs">Open docs <ArrowRight size={18} weight="bold" aria-hidden /></Link></section>
    </main>
  );
}

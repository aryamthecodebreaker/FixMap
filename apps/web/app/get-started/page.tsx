import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Command, GithubLogo, Robot, TerminalWindow } from "@phosphor-icons/react/ssr";
import { CopyCommand } from "../_components/copy-command";
import { commands, marketplaceUrl, repoUrl, siteStats } from "../_lib/site-data";

export const metadata: Metadata = {
  title: "Get started",
  description: "Try FixMap once, add /fixmap to a coding agent, run it in a terminal, or add it to pull requests.",
  alternates: { canonical: "/get-started" },
  openGraph: {
    title: "Get started with FixMap",
    description: "Try FixMap once, add it to a coding agent, or run it automatically on pull requests.",
    url: "/get-started"
  }
};

export default function GetStartedPage() {
  return (
    <main>
      <section className="subpage-hero page-shell">
        <p className="eyebrow">Fastest way to try FixMap</p>
        <h1>Run it once. <em>Install it only if it helps.</em></h1>
        <p>Paste this command into a terminal. FixMap will inspect a public GitHub issue, scan a temporary checkout, show where to start, and remove the checkout when it finishes.</p>
        <div className="setup-quick-try">
          <CopyCommand command="npx -y @aryam/fixmap@latest plan --issue https://github.com/chalk/chalk/issues/624" />
          <p>Requires Node.js 20.11 or newer. No account, API key, model call, or global installation.</p>
        </div>
        <div className="jump-links" aria-label="Choose a FixMap setup"><a href="#agent">Coding agent</a><a href="#terminal">Terminal</a><a href="#pull-requests">Pull requests</a><a href="#mcp">Advanced MCP</a></div>
      </section>

      <section className="setup-section page-shell" id="agent">
        <div className="setup-heading"><span>01</span><Command size={34} aria-hidden /><div><p className="eyebrow">Recommended for coding agents</p><h2>Add /fixmap to your agent.</h2></div></div>
        <div className="setup-content">
          <p className="setup-lede">Choose this path if you use Claude Code, Cursor, GitHub Copilot, or Agent Skills. Two commands install FixMap and make <code>/fixmap</code> discoverable in the current project.</p>
          <ol className="setup-steps">
            <li><strong>Install FixMap</strong><CopyCommand command="npm install --global @aryam/fixmap@latest" /></li>
            <li><strong>Add the agent command</strong><CopyCommand command={commands.setup} /></li>
            <li><strong>Use it</strong><p>Type <code>/fixmap</code> in your coding agent, then choose Plan before editing or Verify after the change.</p></li>
          </ol>
          <details className="setup-advanced">
            <summary>Choose one specific agent or inspect every workflow</summary>
            <p>Target one integration with <code>--agent claude</code>, <code>cursor</code>, <code>copilot</code>, or <code>agents</code>. The installer will not overwrite a customized command unless you explicitly use <code>--force</code>.</p>
            <CopyCommand command={commands.features} />
          </details>
        </div>
      </section>

      <section className="setup-section page-shell" id="terminal">
        <div className="setup-heading"><span>02</span><TerminalWindow size={34} aria-hidden /><div><p className="eyebrow">Terminal</p><h2>Install once. Describe the task.</h2></div></div>
        <div className="setup-content">
          <p className="setup-lede">Install FixMap globally, then give it a public issue URL or describe a problem inside a local repository.</p>
          <CopyCommand command="npm install --global @aryam/fixmap@latest" />
          <CopyCommand command={commands.publicIssue} />
          <p className="setup-result"><strong>What you get:</strong> a short list of files to inspect first, tests and checks to run, nearby impact, and risks worth reviewing.</p>
          <details className="setup-advanced">
            <summary>Show local repository and advanced commands</summary>
            <h3>Work inside a local repository</h3>
            <CopyCommand command={commands.localTask} />
            <CopyCommand command={commands.diff} />
            <h3>Prepare a compact handoff for an agent</h3>
            <CopyCommand command={'fixmap plan --issue "reset links fail" --format agent'} />
            <h3>Package source context within a budget</h3>
            <CopyCommand command={commands.context} />
            <h3>Export the impact relationships</h3>
            <CopyCommand command={commands.graph} />
            <h3>Watch an agent&apos;s edits</h3>
            <CopyCommand command={'fixmap watch --report plan.json --repo . --include-untracked'} />
            <h3>Benchmark this repository</h3>
            <CopyCommand command="fixmap benchmark --repo . --last 50" />
            <h3>Pin FixMap to a project</h3>
            <CopyCommand command="npm install --save-dev @aryam/fixmap" />
            <p>Use <code>npx fixmap</code> inside that repository or call it from an npm script.</p>
          </details>

          <details className="setup-advanced">
            <summary>Troubleshoot versions and make an isolated PowerShell test</summary>
            <p>Run <code>fixmap doctor</code> when an older project or global install may be shadowing the version you expected.</p>
            <CopyCommand command="fixmap doctor" />
            <p>For an exact clean test on Windows, create the directory before changing into it:</p>
            <CopyCommand command={`$fixmapTestPath = Join-Path $env:USERPROFILE "fixmaptesting"
New-Item -ItemType Directory -Path $fixmapTestPath -Force -ErrorAction Stop | Out-Null
Set-Location $fixmapTestPath -ErrorAction Stop
npm init -y
npm install --save-dev @aryam/fixmap
npx fixmap --version
New-Item -ItemType Directory -Path "src" -Force -ErrorAction Stop | Out-Null
Set-Content -Path "src\\reset-password.ts" -Encoding utf8 -Value @'
export async function resetPassword(email: string) {
  return sendResetEmail(email);
}
'@
npx fixmap plan --issue "password reset emails fail"`} />
            <p>Use <code>Get-Location</code> before installing whenever a directory command reports an error. Treat the version printed by Doctor as the version actually running.</p>
          </details>
          <p className="small-note">Requires Node.js 20.11 or newer. FixMap runs locally with no account, API key, or model call.</p>
        </div>
      </section>

      <section className="setup-section page-shell" id="mcp">
        <div className="setup-heading"><span>03</span><Robot size={34} aria-hidden /><div><p className="eyebrow">Advanced agent setup</p><h2>Connect FixMap as tools your agent can call.</h2></div></div>
        <div className="setup-content">
          <p className="setup-lede">Use MCP when you want a compatible agent to request a plan, ask why a file was included or missed, package source context, inspect impact relationships, or verify a completed change.</p>
          <h3>Claude Code</h3>
          <CopyCommand command="claude mcp add fixmap -- fixmap mcp" />
          <h3>Cursor, Windsurf, and other MCP clients</h3>
          <pre className="code-block" tabIndex={0}><code>{`{
  "mcpServers": {
    "fixmap": {
      "command": "fixmap",
      "args": ["mcp"]
    }
  }
}`}</code></pre>
          <p className="small-note">Analysis runs locally over stdio. FixMap does not send repository source to a hosted model or service. Plan, Context, Graph, Explain, and Verify accept <code>noCache: true</code> for an explicit fresh scan.</p>
        </div>
      </section>

      <section className="setup-section page-shell" id="pull-requests">
        <div className="setup-heading"><span>04</span><GithubLogo size={34} weight="fill" aria-hidden /><div><p className="eyebrow">Pull requests</p><h2>Post a FixMap report automatically.</h2></div></div>
        <div className="setup-content">
          <p className="setup-lede">The GitHub Action comments with the map on each pull request and writes the complete result to the job summary.</p>
          <pre className="code-block" tabIndex={0}><code>{`name: FixMap
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

import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, FileText, Hash } from "@phosphor-icons/react/ssr";
import { CopyCommand } from "../_components/copy-command";
import { actionWorkflow, commands, marketplaceUrl, repoUrl } from "../_lib/site-data";

export const metadata: Metadata = {
  title: "Docs",
  description: "Install FixMap in your AI coding tool, the terminal, over MCP or on pull requests, then plan, explain, verify and more.",
  alternates: { canonical: "/docs" },
  openGraph: { title: "FixMap docs", description: "Install FixMap and use every command.", url: "/docs" }
};

const toc = [
  ["install", "Install"],
  ["plan", "Your first plan"],
  ["commands", "All commands"],
  ["verify", "Check a finished change"],
  ["mcp", "MCP tools"],
  ["output", "Output formats"],
  ["safety", "What FixMap never does"]
] as const;

export default function DocsPage() {
  return (
    <>
      <div className="shell page-head">
        <h1>Docs</h1>
        <p>Set FixMap up once, then use it before every fix. Everything runs on your computer. There is no account, no API key and no AI model.</p>
      </div>
      <div className="shell read-layout">
        <nav className="toc" aria-label="Docs sections">
          {toc.map(([id, label]) => <a key={id} href={`#${id}`}><Hash aria-hidden />{label}</a>)}
        </nav>
        <div className="file-view">
          <div className="file-view-head"><BookOpen aria-hidden /> README.md</div>
          <article className="prose">
            <h2 id="install">Install</h2>
            <h3 id="agent">In your AI coding tool</h3>
            <p>For Claude Code, Cursor, GitHub Copilot and tools that read agent skills. Install once, add the command to your project, then type <code>/fixmap</code> before you ask for a fix.</p>
            <CopyCommand command="npm install --global @aryam/fixmap@latest" />
            <CopyCommand command={commands.setup} />
            <p><code>fixmap setup</code> can be run again safely. It will not overwrite a command you customised unless you pass <code>--force</code>.</p>

            <h3 id="terminal">In the terminal</h3>
            <p>Try it without installing, on any public GitHub issue:</p>
            <CopyCommand command="npx -y @aryam/fixmap@latest plan --issue https://github.com/chalk/chalk/issues/624" />
            <p>Or add it to one project only:</p>
            <CopyCommand command="npm install --save-dev @aryam/fixmap" />

            <h3 id="pull-requests">On pull requests</h3>
            <p>The GitHub Action posts the starting list as a comment on each pull request. Save this as <code>.github/workflows/fixmap.yml</code>, or <a href={marketplaceUrl}>install it from the Marketplace</a>.</p>
            <pre className="block" tabIndex={0}><code>{actionWorkflow}</code></pre>

            <h2 id="plan">Your first plan</h2>
            <p>Describe the problem the way you would to a teammate. FixMap answers with the files to open first, the test to run, related code to check and anything it is unsure about.</p>
            <CopyCommand command={commands.localTask} />
            <p>It also takes a GitHub issue link, a task file, or a diff of what you have changed so far:</p>
            <CopyCommand command={commands.publicIssue} />
            <CopyCommand command={commands.diff} />
            <CopyCommand command={'fixmap plan --working-tree --issue "reset flow"'} />
            <p>For a remote repository only issue text works; clone it to use diffs and full Git history. When history is shallow or missing, FixMap says so and keeps using imports and tests.</p>

            <h2 id="commands">All commands</h2>
            <p><code>fixmap features</code> lists every command in the version you have, and which ones are still marked preview.</p>
            <CopyCommand command={commands.features} />
            <h3 id="context">context: hand over the right code</h3>
            <p>Picks the most useful lines from the files in the plan, within a size budget (10,000 estimated tokens by default, about four bytes per token).</p>
            <CopyCommand command={commands.context} />
            <h3 id="graph">graph: draw how the files connect</h3>
            <p>Exports imports, files that use them, tests and files that change together, as a Mermaid diagram or JSON.</p>
            <CopyCommand command={commands.graph} />
            <h3 id="explain">explain: why is a file missing?</h3>
            <p>Tells you whether a file ranked lower, fell below the cutoff, was excluded on purpose, or was never scanned.</p>
            <CopyCommand command={'fixmap plan --issue "reset links fail" --explain src/auth/token.ts'} />
            <h3 id="focus">Focus the list</h3>
            <p>Leave out folders that only talk about the product, like a marketing site. Patterns can also go in a <code>.fixmapignore</code> file.</p>
            <CopyCommand command={'fixmap plan --issue "reset links fail" --exclude apps/web --limit 3'} />
            <h3 id="compare">compare: did a better task help?</h3>
            <CopyCommand command={'fixmap plan --issue "TOKEN_TTL_MINUTES is ignored" --compare before.json'} />
            <h3 id="watch">watch: keep checking while an agent edits</h3>
            <CopyCommand command={'fixmap watch --report plan.json --repo . --include-untracked'} />
            <h3 id="benchmark">benchmark: test FixMap on your own history</h3>
            <p>Replays recent commits and measures how often FixMap would have pointed at the file that changed, next to plain keyword search.</p>
            <CopyCommand command="fixmap benchmark --repo . --last 50" />
            <h3 id="doctor">doctor: which FixMap actually ran?</h3>
            <CopyCommand command="fixmap doctor" />

            <h2 id="verify">Check a finished change</h2>
            <p>Save a plan before editing, then compare it with the real change afterwards. Verify points out changed files the plan did not expect and related code nobody touched.</p>
            <CopyCommand command={'fixmap plan --issue "reset links fail" --format json --output plan.json'} />
            <CopyCommand command={commands.verify} />
            <p>Verify does not run your tests or judge whether the fix is right. Add <code>--fail-on warning</code> to make warnings fail CI too.</p>

            <h2 id="mcp">MCP tools</h2>
            <p>Lets an agent call FixMap itself: plan, context, graph, explain, compare, verify and doctor, all over local stdio.</p>
            <CopyCommand command="claude mcp add fixmap -- fixmap mcp" />
            <p>For Cursor, Windsurf and other clients:</p>
            <pre className="block" tabIndex={0}><code>{`{
  "mcpServers": {
    "fixmap": { "command": "fixmap", "args": ["mcp"] }
  }
}`}</code></pre>

            <h2 id="output">Output formats</h2>
            <p>Markdown by default. <code>--format agent</code> gives a compact list made for AI tools; <code>--format json</code> gives structured data you can save with <code>--output</code>.</p>
            <CopyCommand command={'fixmap plan --issue "reset links fail" --format agent'} />
            <p>JSON plans carry <code>reportVersion: 1</code>. New fields may be added, existing ones never change type, and <code>fixmap validate plan.json</code> checks a saved file.</p>

            <h2 id="safety">What FixMap never does</h2>
            <ul>
              <li>Install dependencies, or run your scripts, builds, tests or Git hooks.</li>
              <li>Upload your code, or call a hosted AI model.</li>
              <li>Claim that its list proves a change is correct.</li>
            </ul>
            <p><a href={`${repoUrl}/blob/main/SECURITY.md`}>Security policy</a> · <Link href="/evidence">How well it works</Link> · <a href={`${repoUrl}/issues`}><FileText size={14} aria-hidden style={{ display: "inline", verticalAlign: "-2px" }} /> Report a problem</a></p>
          </article>
        </div>
      </div>
    </>
  );
}

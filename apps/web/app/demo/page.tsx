import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Browser, LockKey, Sparkle } from "@phosphor-icons/react/ssr";
import { buildReportFromRepo, renderMarkdownReport, renderVerifyMarkdown, verifyPlan } from "@aryam/fixmap-core/browser";
import { Demo } from "../demo";
import { sampleRepo, sampleRepoWithChanges } from "../sample-repo";

export const metadata: Metadata = {
  title: "Live demo",
  description: "Try FixMap Plan, Explain, Compare, focus controls, and Verify on a sample repository in your browser.",
  alternates: { canonical: "/demo" },
  openGraph: {
    title: "Live FixMap demo",
    description: "Run the real FixMap ranking and verification engine in your browser.",
    url: "/demo"
  }
};

const agentTask = "sendMail times out when password reset email transport is unavailable";
const agentPlan = buildReportFromRepo(sampleRepo, { issueText: agentTask, limit: 3 });
const agentPlanOutput = renderMarkdownReport(agentPlan).trim();
const agentVerification = verifyPlan(
  agentPlan,
  sampleRepoWithChanges(["src/config.ts", "src/email/transport.ts", "test/auth/reset-password.test.ts"])
);
const agentVerificationOutput = renderVerifyMarkdown(agentVerification).trim();

export default function DemoPage() {
  return (
    <main>
      <section className="subpage-hero compact-hero page-shell">
        <p className="eyebrow">Live demo</p>
        <h1>See the map form <em>in real time.</em></h1>
        <p>
          Try Plan, Explain, Compare, exclusions, limits, and Verify against a small sample repository. This is the same core
          logic used by the CLI, running locally in your browser—not a recording or staged result.
        </p>
        <div className="inline-facts">
          <span><Browser size={20} aria-hidden /> Runs in this tab</span>
          <span><LockKey size={20} aria-hidden /> Nothing is uploaded</span>
          <span><Sparkle size={20} aria-hidden /> Start with the first preset</span>
        </div>
      </section>

      <section className="section page-shell demo-page-section">
        <Demo />
      </section>

      <section className="section page-shell">
        <div className="premium-section-intro compact">
          <p className="eyebrow">Example agent conversation</p>
          <h2>Plan → edit carefully → verify.</h2>
          <p>The FixMap turns below are generated from this page&rsquo;s sample repository at build time, using the same renderer as the CLI.</p>
        </div>

        <div className="doc-layout">
          <article className="doc-section">
            <h3>User</h3>
            <p>{agentTask}. Can you fix it?</p>

            <h3>Agent</h3>
            <p>I should get a focused map before searching blindly.</p>
            <p><strong>Calls <code>fixmap_plan</code>:</strong></p>
            <pre tabIndex={0}><code>{`{
  "issue": "${agentTask}",
  "limit": 3
}`}</code></pre>

            <h3>FixMap</h3>
            <pre tabIndex={0}><code>{agentPlanOutput}</code></pre>

            <h3>Agent edits carefully</h3>
            <p>The agent opens the leading files, confirms the evidence, and adds a bounded SMTP connection timeout:</p>
            <pre tabIndex={0}><code>{`// Before
const transport = createTransport({ host: config.smtpHost, port: config.smtpPort });

// After
const transport = createTransport({
  host: config.smtpHost,
  port: config.smtpPort,
  connectionTimeout: config.smtpTimeoutMs
});`}</code></pre>
            <p>The configuration and related reset-email test are updated too.</p>

            <p><strong>Calls <code>fixmap_verify</code>:</strong></p>
            <pre tabIndex={0}><code>{`{
  "report": { "...": "the previous FixMap JSON plan" },
  "diff": "main...HEAD"
}`}</code></pre>

            <h3>FixMap</h3>
            <pre tabIndex={0}><code>{agentVerificationOutput}</code></pre>

            <h3>Agent proves the fix</h3>
            <pre tabIndex={0}><code>npm run test</code></pre>
            <p>After the test passes, the agent reports the cause, the code change, and the validation result.</p>
          </article>

          <aside className="doc-sidebar">
            <p className="eyebrow">Why this pattern works</p>
            <ol>
              <li><strong>Plan:</strong> reach the likely fix site without blind searching.</li>
              <li><strong>Verify the evidence:</strong> never edit only because a file ranked first.</li>
              <li><strong>Edit:</strong> keep the change focused and update the related test.</li>
              <li><strong>Verify:</strong> catch drift between the original plan and the real diff.</li>
              <li><strong>Run tests:</strong> FixMap routes checks; it does not pretend to execute them.</li>
            </ol>
          </aside>
        </div>
      </section>

      <section className="section page-shell demo-next">
        <div><p className="eyebrow">Ready for your repository?</p><h2>Take the same workflow to the terminal.</h2></div>
        <div><p>Run one command for a public GitHub issue, or use FixMap locally for private source and working-tree diffs.</p><Link className="button primary" href="/get-started">Choose a setup <ArrowRight size={18} weight="bold" aria-hidden /></Link></div>
      </section>
    </main>
  );
}

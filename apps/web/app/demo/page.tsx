import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Browser, LockKey, Sparkle } from "@phosphor-icons/react/ssr";
import { buildReportFromRepo, renderMarkdownReport, renderVerifyMarkdown, verifyPlan } from "@aryam/fixmap-core/browser";
import { Demo } from "../demo";
import { sampleRepo, sampleRepoWithChanges } from "../sample-repo";

export const metadata: Metadata = {
  title: "Live demo",
  description: "Give FixMap a sample task and see the files, tests, impact, and risks it surfaces before a change begins.",
  alternates: { canonical: "/demo" },
  openGraph: {
    title: "Live FixMap demo",
    description: "See the real FixMap engine choose files, tests, impact, and risks in your browser.",
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
        <h1>See FixMap choose <em>where to start.</em></h1>
        <p>
          Pick a sample software problem. FixMap will show the files to inspect first, the checks that can prove the change,
          nearby impact, and risks worth reviewing. The real engine runs below—not a recording or staged result.
        </p>
        <div className="inline-facts">
          <span><Browser size={20} aria-hidden /> Real FixMap engine</span>
          <span><LockKey size={20} aria-hidden /> Nothing is uploaded</span>
          <span><Sparkle size={20} aria-hidden /> Choose an example below</span>
        </div>
      </section>

      <section className="section page-shell demo-page-section">
        <Demo />
      </section>

      <section className="section page-shell">
        <div className="premium-section-intro compact">
          <p className="eyebrow">Optional technical detail</p>
          <h2>See the complete agent conversation.</h2>
          <p>Open the transcript to follow the exact Plan → edit → Verify workflow generated from this sample repository.</p>
        </div>

        <details className="demo-transcript">
          <summary>Open the complete Plan → edit → Verify example</summary>
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
        </details>
      </section>

      <section className="section page-shell demo-next">
        <div><p className="eyebrow">Ready for your repository?</p><h2>Give the next task a better starting point.</h2></div>
        <div><p>Try FixMap once, add <code>/fixmap</code> to a coding agent, or run it automatically on pull requests.</p><Link className="button primary" href="/get-started">Choose how to use FixMap <ArrowRight size={18} weight="bold" aria-hidden /></Link></div>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Browser, LockKey, Sparkle } from "@phosphor-icons/react/ssr";
import { Demo } from "../demo";

export const metadata: Metadata = {
  title: "Live demo",
  description: "Try FixMap Plan, Explain, Compare, focus controls, and Verify on a sample repository in your browser."
};

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
          <p>A realistic TypeScript/Node.js password-reset repair using FixMap through MCP.</p>
        </div>

        <div className="doc-layout">
          <article className="doc-section">
            <h3>User</h3>
            <p>Password reset emails are not being sent when a user requests a password reset. Can you fix it?</p>

            <h3>Agent</h3>
            <p>I should get a focused map before searching blindly.</p>
            <p><strong>Calls <code>fixmap_plan</code>:</strong></p>
            <pre><code>{`{
  "issue": "Password reset emails are not being sent when a user requests a password reset",
  "limit": 3
}`}</code></pre>

            <h3>FixMap</h3>
            <pre><code>{`## Context Files
1. src/auth/password-reset.ts — high confidence
   Defines sendPasswordResetEmail and requestPasswordReset
2. src/services/email.ts — medium confidence
   Nodemailer wrapper imported by password-reset
3. src/routes/auth.ts — medium confidence
   Route that calls requestPasswordReset

## Test Routes
- npm test -- src/auth/password-reset.test.ts

## Risk Map
- shared email client behavior deserves review`}</code></pre>

            <h3>Agent edits carefully</h3>
            <p>The agent opens the leading file, confirms the evidence, and finds a missing <code>await</code>:</p>
            <pre><code>{`// Before
emailService.sendPasswordResetEmail(user.email, token);

// After
await emailService.sendPasswordResetEmail(user.email, token);`}</code></pre>
            <p>The related test is updated too.</p>

            <p><strong>Calls <code>fixmap_verify</code>:</strong></p>
            <pre><code>{`{
  "report": { "...": "the previous FixMap JSON plan" },
  "diff": "main...HEAD"
}`}</code></pre>

            <h3>FixMap</h3>
            <pre><code>{`FixMap verified 2 changed files against the plan and found nothing to flag.`}</code></pre>

            <h3>Agent proves the fix</h3>
            <pre><code>npm test -- src/auth/password-reset.test.ts</code></pre>
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

import { Demo } from "./demo";
// Read the recorded evaluations and the published version directly so the site cannot
// drift from what shipped. Numbers typed by hand go stale silently.
import heldout from "../../../benchmarks/heldout/results.json";
import regression from "../../../benchmarks/external/results.json";
import savings from "../../../benchmarks/external/savings-results.json";
import cli from "../../../packages/cli/package.json";

const repoUrl = "https://github.com/aryamthecodebreaker/FixMap";
const installCommand =
  "npx -y @aryam/fixmap plan --issue https://github.com/aryamthecodebreaker/FixMap/issues/59";

type EvaluationCase = { top1: boolean; top3: boolean; top5Hit: boolean };
const hits = (results: EvaluationCase[], key: keyof EvaluationCase) =>
  results.filter((result) => result[key]).length;

const heldoutCases = heldout.results as EvaluationCase[];
const regressionCases = regression.results as EvaluationCase[];
const heldoutTop3 = hits(heldoutCases, "top3");
const heldoutTop1 = hits(heldoutCases, "top1");
const heldoutTop5 = hits(heldoutCases, "top5Hit");
const regressionTop3 = hits(regressionCases, "top3");
const regressionTop1 = hits(regressionCases, "top1");
const regressionTop5 = hits(regressionCases, "top5Hit");
const medianSeconds = (savings.performance.medianScanAndRankMs / 1000).toFixed(2);
const percent = (hitCount: number, total: number) => `${Math.round((hitCount / total) * 100)}%`;

const commands = [
  {
    id: "plan",
    command: "fixmap plan --issue \"reset links expire immediately\"",
    question: "Where do I start?",
    answer:
      "Ranked files with a score, a confidence label, and the reasons behind both. The nearest test command, the risk areas the change touches, and diagnostics for anything uncertain.",
    badge: "the main one"
  },
  {
    id: "explain",
    command: "fixmap plan --issue \"…\" --explain src/billing/invoice.ts",
    question: "Why is my file not in that list?",
    answer:
      "The one question a ranked list cannot answer. It separates the cases that actually differ: ranked lower than you thought, scored below the cutoff, excluded on purpose, or never scanned at all.",
    badge: "new in v0.7.3"
  },
  {
    id: "verify",
    command: "fixmap verify --report plan.json --diff main...HEAD",
    question: "Did the change match the plan?",
    answer:
      "Compares the saved plan against the real diff. Catches edits a build will discard, files the change needed that the plan never ranked, source moving with no test, and risk nobody flagged.",
    badge: "new in v0.7.3"
  },
  {
    id: "mcp",
    command: "claude mcp add fixmap -- npx -y @aryam/fixmap mcp",
    question: "Can my agent just ask for it?",
    answer:
      "One stdio MCP tool. Claude Code, Cursor, Windsurf, and any other MCP client get the same report without a human running anything. Analysis stays on your machine.",
    badge: "for agents"
  }
];

const benefits = [
  {
    title: "Your agent stops opening the wrong file first",
    body: "Agents are fast once they have the right context. The expensive part is the search before the first edit — the plausible file that is not the definition, the test command that does not cover the change."
  },
  {
    title: "Nothing leaves your machine",
    body: "No account, no API key, no model call, no telemetry. Local repositories are read locally; a public issue URL uses an anonymous throwaway checkout that is deleted when the report is done."
  },
  {
    title: "Same input, same output, every time",
    body: "There is no model in the loop, so a report is reproducible and reviewable. You can diff two runs, pin it in CI, and argue with the ranking — every score comes with its reasons attached."
  },
  {
    title: "It tells you when it does not know",
    body: "A vague task returns an empty report and says why. An invented identifier gets named in a diagnostic instead of quietly matching something. Confidence is capped when the evidence is thin."
  },
  {
    title: "It never runs your code",
    body: "No install, no build, no test execution, no package scripts, no git hooks. FixMap reads and ranks — which is why it is safe to point at a repository you have not read yourself."
  },
  {
    title: "Free, MIT, about two seconds",
    body: `Median scan and rank across the benchmarked repositories is ${medianSeconds} seconds. The core has zero runtime dependencies, and every benchmark input and output is committed in the repo.`
  }
];

export default function HomePage() {
  return (
    <main>
      <nav className="nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="FixMap home">
          <span className="brand-mark">FM</span>
          <span>FixMap</span>
        </a>
        <div className="nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#demo">Try it</a>
          <a href="#commands">Commands</a>
          <a href="#evidence">Evidence</a>
          <a className="nav-github" href={repoUrl}>GitHub ↗</a>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="status-dot" /> Open source · local first · no API key</p>
          <h1>Give your coding agent a map <em>before</em> it starts editing.</h1>
          <p className="lede">
            Describe a bug, paste a GitHub issue, or point at a diff. FixMap returns the files to
            open first, the test command that covers them, and the risks worth a second look —
            in about two seconds, with no model call and nothing uploaded.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#quickstart">Run one command</a>
            <a className="button secondary" href="#demo">Try it in the browser</a>
            <a className="button github-button" href={repoUrl}>View on GitHub ↗</a>
          </div>
          <div className="proof-row" aria-label="Measured results">
            <span>
              <b>{heldoutTop3}/{heldout.cases}</b> fixing files in the top 3, on repos never tuned against
            </span>
            <span><b>{medianSeconds}s</b> median scan + rank</span>
            <span>No API key · no model call</span>
          </div>
        </div>
        <div className="hero-terminal" aria-label="Example FixMap report">
          <div className="terminal-bar"><span /><span /><span /><code>fixmap plan</code></div>
          <div className="terminal-body">
            {/* The listing below is this exact command's real output on the demo's sample
                repository — including the confidence labels. Change one, re-run the other. */}
            <p className="terminal-command">
              fixmap plan --issue &quot;TOKEN_TTL_MINUTES is ignored, reset links expire immediately&quot;
            </p>
            <p className="terminal-label">CONTEXT</p>
            <p><strong>01</strong> src/auth/reset-password.ts <b>high</b></p>
            <p><strong>02</strong> src/email/templates/reset.ts <b>high</b></p>
            <p><strong>03</strong> src/auth/token-store.ts <i>medium</i></p>
            <p className="terminal-label">TEST ROUTE</p>
            <p><strong>→</strong> npm run test</p>
            <p className="terminal-label">RISK</p>
            <p><strong>!</strong> authentication · high severity</p>
          </div>
        </div>
      </section>

      <section className="workflow" id="how-it-works">
        <div className="section-heading">
          <p className="kicker">What actually happens</p>
          <h2>One command in. A map out. No model in the middle.</h2>
          <p>
            FixMap is a routing step you run <em>before</em> an agent starts searching. It reads the
            repository, ranks it against your task, and hands back four things you can check.
          </p>
        </div>

        <div className="anatomy">
          <div className="anatomy-input">
            <p className="anatomy-caption">You give it a task</p>
            <pre><code>fixmap plan --issue &quot;TOKEN_TTL_MINUTES is ignored,
  reset links expire immediately&quot;</code></pre>
            <p className="anatomy-note">
              Or a GitHub issue URL, or <code>--diff main...HEAD</code>. A local repository is never
              uploaded; a public URL is fetched into a temporary checkout and deleted afterwards.
            </p>
          </div>
          <ol className="anatomy-output">
            <li>
              <h3>Ranked files, with reasons</h3>
              <p>
                <code>src/auth/reset-password.ts</code> — score 27, high confidence, because it
                <em> defines TOKEN_TTL_MINUTES</em>, its path matches the task, and it declares
                two more symbols the task names. Every point is traceable to a signal you can
                disagree with.
              </p>
            </li>
            <li>
              <h3>The test command that covers them</h3>
              <p>
                The nearest workspace script — <code>npm --prefix packages/api run test</code>, not a
                repository-wide guess — plus the specific tests that command can actually reach.
              </p>
            </li>
            <li>
              <h3>Risk areas the change touches</h3>
              <p>
                Authentication, billing, data migrations, public API surface. Derived from real
                evidence: demo and example directories are ignored, changed files count anywhere.
              </p>
            </li>
            <li>
              <h3>Diagnostics for what it is unsure about</h3>
              <p>
                A vague task, an identifier that does not exist in the repository, a scan that hit
                its limit, a ranking too flat to call. Said out loud, not hidden behind a score.
              </p>
            </li>
          </ol>
        </div>

        <p className="anatomy-footer">
          Output is Markdown for a human or JSON for the next tool. Nothing is executed — no
          install, no build, no test run, no package scripts, no git hooks.
        </p>
      </section>

      <section className="demo-section" id="demo">
        <div className="section-heading">
          <p className="kicker">Running here, in this tab</p>
          <h2>Try all three commands on a sample repository.</h2>
          <p>
            This page imports the same ranking, explanation, and verification code the CLI runs,
            and points it at a small sample repository — build output, examples, lockfile and all.
            It is the tool, not a recording of it. Start with the first preset: it is the case
            FixMap handles <em>worst</em>.
          </p>
        </div>
        <Demo />
      </section>

      <section className="commands" id="commands">
        <div className="section-heading">
          <p className="kicker">Four ways in</p>
          <h2>Three commands and an agent socket.</h2>
          <p>
            <code>plan</code> is the one you will use daily. The other three exist because a ranked
            list on its own leaves obvious questions unanswered.
          </p>
        </div>
        <div className="command-grid">
          {commands.map((entry) => (
            <article className="command-card" key={entry.id}>
              <p className="command-badge">{entry.badge}</p>
              <pre><code>{entry.command}</code></pre>
              <h3>{entry.question}</h3>
              <p>{entry.answer}</p>
            </article>
          ))}
        </div>
        <div className="command-extra">
          <div>
            <h3>Or leave it running on every pull request</h3>
            <p>
              The GitHub Action posts one report as a pull-request comment and writes the full
              version to the step summary. On forked pull requests it warns instead of failing,
              because GitHub hands it a read-only token.
            </p>
          </div>
          <a className="button secondary" href="https://github.com/marketplace/actions/fixmap">
            Install from Marketplace ↗
          </a>
        </div>
      </section>

      <section className="benefits" id="benefits">
        <div className="section-heading">
          <p className="kicker">Why bother</p>
          <h2>The point is not speed. It is not guessing.</h2>
        </div>
        <div className="benefit-grid">
          {benefits.map((benefit) => (
            <article key={benefit.title}>
              <h3>{benefit.title}</h3>
              <p>{benefit.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="evidence" id="evidence">
        <div className="section-heading">
          <p className="kicker">Measured, not asserted</p>
          <h2>Most tools show you the benchmark they tuned on. Here is both.</h2>
          <p>
            Every case is a real issue that was later closed by a merged pull request. FixMap sees the repository
            as it stood <em>before</em> the fix and the issue text a maintainer actually wrote. A hit means the file
            that fix changed came back in the ranking.
          </p>
        </div>

        <div className="evidence-grid">
          <article className="evidence-card primary">
            <p className="evidence-label">Held-out · {heldout.cases} repos</p>
            <p className="evidence-figure">{heldoutTop3}/{heldout.cases}</p>
            <p className="evidence-caption">in the top 3</p>
            <p className="evidence-note">
              Selected after the ranker was finished, by the same mechanical rule.
              <strong> Never tuned against.</strong>
            </p>
            <dl className="evidence-detail">
              <div><dt>Top-1</dt><dd>{heldoutTop1}/{heldout.cases} ({percent(heldoutTop1, heldout.cases)})</dd></div>
              <div><dt>Top-5</dt><dd>{heldoutTop5}/{heldout.cases} ({percent(heldoutTop5, heldout.cases)})</dd></div>
            </dl>
          </article>

          <article className="evidence-card">
            <p className="evidence-label">Regression · {regression.cases} repos</p>
            <p className="evidence-figure muted">{regressionTop3}/{regression.cases}</p>
            <p className="evidence-caption">in the top 3</p>
            <p className="evidence-note">
              These cases guided development — when one missed, the ranker changed.
              <strong> Not a generalization estimate.</strong>
            </p>
            <dl className="evidence-detail">
              <div><dt>Top-1</dt><dd>{regressionTop1}/{regression.cases} ({percent(regressionTop1, regression.cases)})</dd></div>
              <div><dt>Top-5</dt><dd>{regressionTop5}/{regression.cases} ({percent(regressionTop5, regression.cases)})</dd></div>
            </dl>
          </article>
        </div>

        <p className="evidence-verdict">
          Plan around the <strong>{percent(heldoutTop3, heldout.cases)}</strong>, not the{" "}
          {percent(regressionTop3, regression.cases)}. Top-1 does not degrade on unseen code—it is slightly higher
          there—so the signals FixMap ranks on genuinely transfer. The top-3 gap between the two columns is what
          fitting bought on the tuned set, and nothing more.
        </p>

        <p className="evidence-disclaimer">
          <strong>What this does not claim:</strong> there is no “tokens saved” or “minutes saved” number here.
          An honest one needs a controlled run of the same tasks with and without FixMap, which has not been done.
          The {heldout.cases - heldoutTop3} held-out misses are published with their real rankings rather than removed.
          At twelve cases one result flipping moves top-3 by eight points, so read these as “about three quarters”,
          not as two significant figures.
        </p>

        <div className="evidence-links">
          <a className="button secondary" href={`${repoUrl}/tree/main/benchmarks/heldout`}>Held-out cases and results ↗</a>
          <a className="button secondary" href={`${repoUrl}/tree/main/benchmarks/external`}>Regression suite ↗</a>
          <a className="button secondary" href={`${repoUrl}/tree/main/benchmarks/adversarial`}>Adversarial suite ↗</a>
        </div>
      </section>

      <section className="film-section" id="launch-film">
        <div className="film-copy">
          <p className="kicker">24-second product film</p>
          <h2>See the handoff before the first edit.</h2>
          <p id="launch-film-description">
            The film moves from the wrong-file problem to a ranked context file, a test route, and an explicit risk note—the core FixMap workflow in one short pass.
          </p>
          <div className="film-links">
            <a className="button primary" href={repoUrl}>Explore the GitHub repo ↗</a>
            <a className="button secondary" href="/fixmap-launch.mp4">Open the video</a>
          </div>
          <p className="film-note">Original product film · 1280×720 · sound on · current release v{cli.version}</p>
        </div>
        <figure className="film-frame">
          <video
            controls
            playsInline
            preload="metadata"
            poster="/fixmap-launch-poster.jpg"
            aria-label="FixMap launch film"
            aria-describedby="launch-film-description"
          >
            <source src="/fixmap-launch.mp4" type="video/mp4" />
            Your browser does not support embedded video. <a href="/fixmap-launch.mp4">Open the MP4 instead.</a>
          </video>
          <figcaption>FixMap turns a task into explainable context, verification routes, and reviewable risk.</figcaption>
        </figure>
      </section>

      <section className="quickstart" id="quickstart">
        <div>
          <p className="kicker">Thirty-second start</p>
          <h2>One command. No account. No API key.</h2>
          <p>
            Paste a public GitHub issue URL. FixMap fetches the task, infers the repository, scans a
            temporary checkout, and deletes it when the report is done. Run it inside your own
            repository and it reads that instead — nothing is uploaded either way.
          </p>
        </div>
        <pre><code>{installCommand}</code></pre>
        <p className="quickstart-note">
          Requires Node.js 20.11 or newer. Nothing is installed permanently — <code>npx</code> runs
          it once. The CLI points you at <code>--explain</code> and <code>verify</code> as they
          become useful, so you do not have to remember they exist.
        </p>
        <div className="quick-links">
          <a className="button primary" href={`${repoUrl}#readme`}>Read the docs</a>
          <a className="button secondary" href={`${repoUrl}/tree/main/examples`}>See real reports</a>
          <a className="button secondary" href={`${repoUrl}/issues/new`}>Report a wrong ranking</a>
        </div>
      </section>

      <footer>
        <a className="brand" href="#top"><span className="brand-mark">FM</span><span>FixMap</span></a>
        <p>
          Open-source repo intelligence for AI-assisted development. v{cli.version}, MIT licensed.
          If FixMap ranks the wrong file on your repository, that case is worth more than any we
          picked ourselves — open an issue and it becomes a permanent benchmark case.
        </p>
        <a href={repoUrl}>MIT licensed on GitHub ↗</a>
      </footer>
    </main>
  );
}

import { Demo } from "./demo";
// Read the recorded evaluations directly so the site cannot drift from the
// benchmark. Published numbers that are typed by hand go stale silently.
import heldout from "../../../benchmarks/heldout/results.json";
import regression from "../../../benchmarks/external/results.json";
import savings from "../../../benchmarks/external/savings-results.json";

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

export default function HomePage() {
  return (
    <main>
      <nav className="nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="FixMap home">
          <span className="brand-mark">FM</span>
          <span>FixMap</span>
        </a>
        <div className="nav-links">
          <a href="#launch-film">Film</a>
          <a href="#demo">Demo</a>
          <a href="#evidence">Evidence</a>
          <a href="#how-it-works">How it works</a>
          <a className="nav-github" href="https://github.com/aryamthecodebreaker/FixMap">GitHub ↗</a>
        </div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="status-dot" /> Open source · local first · no API key</p>
          <h1>Give your coding agent a map <em>before</em> it starts editing.</h1>
          <p className="lede">
            FixMap turns an issue or git diff into the files to inspect, tests to run, and risks a human should review.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#quickstart">Try the CLI</a>
            <a className="button secondary" href="#launch-film">Watch the launch film</a>
            <a className="button github-button" href="https://github.com/aryamthecodebreaker/FixMap">View on GitHub ↗</a>
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
          <div className="terminal-bar"><span /><span /><span /><code>fixmap report</code></div>
          <div className="terminal-body">
            <p className="terminal-command">fixmap plan --issue &quot;reset emails fail&quot;</p>
            <p className="terminal-label">CONTEXT</p>
            <p><strong>01</strong> src/auth/reset-password.ts <b>high</b></p>
            <p><strong>02</strong> src/email/send-reset.ts <i>medium</i></p>
            <p className="terminal-label">VERIFY</p>
            <p><strong>→</strong> npm --prefix apps/api run test</p>
            <p className="terminal-label">RISK</p>
            <p><strong>!</strong> authentication · high severity</p>
          </div>
        </div>
      </section>

      <section className="film-section" id="launch-film">
        <div className="film-copy">
          <p className="kicker">23-second product film</p>
          <h2>See the handoff before the first edit.</h2>
          <p id="launch-film-description">
            The film moves from the wrong-file problem to a ranked context file, a test route, and an explicit risk note—the core FixMap workflow in one short pass.
          </p>
          <div className="film-links">
            <a className="button primary" href="https://github.com/aryamthecodebreaker/FixMap">Explore the GitHub repo ↗</a>
            <a className="button secondary" href="/fixmap-launch.mp4">Open the video</a>
          </div>
          <p className="film-note">Original product film · 1280×720 · sound on · current release v0.7.1</p>
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

      <section className="demo-section" id="demo">
        <div className="section-heading">
          <p className="kicker">Interactive sample</p>
          <h2>Change the task. Watch the repo map change.</h2>
          <p>This browser demo ranks a safe sample repository. The CLI applies the same transparent ideas to your real checkout.</p>
        </div>
        <Demo />
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
        </p>

        <div className="evidence-links">
          <a className="button secondary" href="https://github.com/aryamthecodebreaker/FixMap/tree/main/benchmarks/heldout">Held-out cases and results ↗</a>
          <a className="button secondary" href="https://github.com/aryamthecodebreaker/FixMap/tree/main/benchmarks/external">Regression suite ↗</a>
        </div>
      </section>

      <section className="workflow" id="how-it-works">
        <div className="section-heading compact">
          <p className="kicker">A grounded handoff</p>
          <h2>Less guessing between task and code.</h2>
        </div>
        <div className="steps">
          <article><span>01</span><h3>Scan locally</h3><p>Read repository shape, workspace scripts, tests, and the requested git diff without uploading source.</p></article>
          <article><span>02</span><h3>Rank with reasons</h3><p>Combine task terms, changed files, file type, path proximity, and repository structure.</p></article>
          <article><span>03</span><h3>Explain the route</h3><p>Return context, commands, risks, confidence, and diagnostics as Markdown or machine-readable JSON.</p></article>
        </div>
      </section>

      <section className="quickstart" id="quickstart">
        <div>
          <p className="kicker">Thirty-second start</p>
          <h2>One command. No account. No API key.</h2>
          <p>Paste a public GitHub issue URL. FixMap fetches the task, infers the repository, and maps where to start.</p>
        </div>
        <pre><code>{installCommand}</code></pre>
        <div className="quick-links">
          <a className="button primary" href="https://github.com/aryamthecodebreaker/FixMap#readme">Read the docs</a>
          <a className="button secondary" href="https://github.com/aryamthecodebreaker/FixMap/tree/main/examples">See examples</a>
        </div>
      </section>

      <footer>
        <a className="brand" href="#top"><span className="brand-mark">FM</span><span>FixMap</span></a>
        <p>Open-source repo intelligence for AI-assisted development.</p>
        <a href="https://github.com/aryamthecodebreaker/FixMap">MIT licensed on GitHub ↗</a>
      </footer>
    </main>
  );
}

import { Demo } from "./demo";

const installCommand =
  "npx -y @aryam/fixmap plan --issue https://github.com/aryamthecodebreaker/FixMap/issues/59";

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
          <div className="proof-row" aria-label="Product properties">
            <span>Deterministic explanations</span>
            <span>Markdown + JSON</span>
            <span>MCP server</span>
            <span>GitHub Action</span>
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
          <p className="film-note">Original product film · 1280×720 · sound on · current release v0.6.2</p>
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

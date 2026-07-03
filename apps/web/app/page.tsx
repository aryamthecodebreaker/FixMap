const sampleReport = `# FixMap Report

FixMap found 3 context files and generated 2 test routes.

## Context Files

- src/auth/reset-password.ts
- src/auth/session.ts
- test/auth/reset-password.test.ts

## Test Route

- npm run test
- npm run typecheck`;

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Open-source repo intelligence for AI-assisted development</p>
        <h1>Help coding agents read the right files and run the right checks.</h1>
        <p className="lede">
          FixMap turns issues, diffs, and pull requests into context packs, test routes, risk maps, and review receipts.
        </p>
        <div className="actions">
          <a href="https://github.com/aryamthecodebreaker/FixMap">GitHub</a>
          <a href="#demo">View demo</a>
        </div>
      </section>
      <section id="demo" className="demo">
        <div>
          <h2>Built for solo devs and maintainers</h2>
          <p>
            Use FixMap before handing work to an AI tool, or run it in GitHub Actions to make AI-generated PRs easier to review.
          </p>
        </div>
        <pre>{sampleReport}</pre>
      </section>
    </main>
  );
}

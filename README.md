<div align="center">

# FixMap

### Know where to edit before the first edit.

Paste a GitHub issue URL, describe a task, or point at a diff. FixMap returns ranked context files, test routes, risk notes, and explainable diagnostics—without an account, API key, or model call.

[![CI](https://github.com/aryamthecodebreaker/FixMap/actions/workflows/ci.yml/badge.svg)](https://github.com/aryamthecodebreaker/FixMap/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40aryam%2Ffixmap)](https://www.npmjs.com/package/@aryam/fixmap)
[![GitHub release](https://img.shields.io/github/v/release/aryamthecodebreaker/FixMap)](https://github.com/aryamthecodebreaker/FixMap/releases/latest)
[![Marketplace](https://img.shields.io/badge/GitHub_Marketplace-FixMap-2ea44f?logo=github)](https://github.com/marketplace/actions/fixmap)
[![MIT](https://img.shields.io/badge/license-MIT-74f0ba)](LICENSE)

[Try one command](#one-command-start) · [Watch the 24-second film](https://fixmap-flax.vercel.app/#launch-film) · [Install the Action](https://github.com/marketplace/actions/fixmap) · [Connect MCP](#mcp-server) · [Contribute](CONTRIBUTING.md)

</div>

## One-command start

Give FixMap a public GitHub issue. It fetches the task, infers the repository, scans an isolated temporary checkout, and removes that checkout when the report is complete:

```bash
npx -y @aryam/fixmap@latest plan --issue https://github.com/aryamthecodebreaker/FixMap/issues/59
```

No clone, signup, configuration, or source upload is required.

<!-- Reproducible recording: regenerate with `npm run build:cli && node scripts/render-demo.mjs` -->
![Animated FixMap terminal recording: one command produces ranked context files with confidence and reasons, a related test route, a high authentication risk note, and honest diagnostics.](docs/assets/fixmap-cli-demo.svg)

## The problem FixMap solves

Coding agents are fast after they find the right context. The expensive mistakes happen before the first edit:

- opening a plausible file instead of the definition that owns the behavior
- missing the nearest test or workspace-specific test command
- treating an unresolved diff as “no changes”
- reviewing a change without an explicit map of affected code and risks

FixMap adds a deterministic routing step before an agent starts searching. Its output is evidence, not a correctness claim:

| Output | What it tells you |
| --- | --- |
| Ranked context files | Where to start, with confidence and inspectable reasons |
| Test routes | Which package command and related tests are likely to verify the change |
| Risk map | Which sensitive areas are touched and why |
| Diagnostics | Missing refs, scan limits, remote-fetch details, and other uncertainty |
| Markdown or JSON | A human handoff or machine-readable input for the next tool |

## Use FixMap your way

### CLI

Analyze a task against any public GitHub repository:

```bash
npx -y @aryam/fixmap@latest plan \
  --issue "support public GitHub issue URLs" \
  --repo https://github.com/aryamthecodebreaker/FixMap
```

Analyze private source or working-tree changes locally:

```bash
npx -y @aryam/fixmap@latest plan --issue "password reset emails fail"
npx -y @aryam/fixmap@latest plan --diff main...HEAD
```

Write machine-readable output:

```bash
npx -y @aryam/fixmap@latest plan \
  --base main \
  --head HEAD \
  --format json \
  --output fixmap-report.json
```

Remote repository mode is issue-only. Clone the repository locally when you need `--diff`, `--base`, or `--head`.

### MCP server

FixMap exposes one stdio tool, `fixmap_plan`, so an agent can request the same report directly.

Claude Code:

```bash
claude mcp add fixmap -- npx -y @aryam/fixmap@latest mcp
```

Cursor, Windsurf, or another MCP client:

```json
{
  "mcpServers": {
    "fixmap": {
      "command": "npx",
      "args": ["-y", "@aryam/fixmap@latest", "mcp"]
    }
  }
}
```

The official MCP Registry identifier is `io.github.aryamthecodebreaker/fixmap`. Analysis runs locally over stdio; FixMap does not send repository source to a hosted model or service.

### GitHub Action

Install [FixMap from GitHub Marketplace](https://github.com/marketplace/actions/fixmap), or add the versioned Action directly:

```yaml
name: FixMap

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
        uses: aryamthecodebreaker/FixMap@v0.7.1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

The Action upserts one marked pull-request comment, writes the complete report to the step summary, and exposes `report`, `context-count`, and `test-route-count` outputs. Pin a [release tag](https://github.com/aryamthecodebreaker/FixMap/releases); a floating `v1` tag will follow wider acceptance testing.

On forked pull requests, GitHub supplies a read-only token. FixMap warns instead of failing and keeps the full report in the step summary and outputs. Do not switch to `pull_request_target` while checking out untrusted fork code just to restore comments.

## Why trust the output?

FixMap is deliberately inspectable:

- **Deterministic:** the same task, repository, and diff produce the same ranking—there is no hidden model call.
- **Explainable:** every ranked file includes reasons such as path matches, content matches, exact definitions, changed-file evidence, or import proximity.
- **Local-first:** local repositories stay local; public URLs use an anonymous temporary checkout.
- **Non-executing:** FixMap never installs dependencies or runs repository build, test, hook, or package scripts.
- **Git-aware:** scans respect `.gitignore`, include untracked files in working-tree diffs, and surface unresolved refs as errors.
- **Monorepo-aware:** test routing understands npm, pnpm, Yarn, Bun, and workspace package boundaries.
- **Bounded:** file counts, text samples, issue bodies, network responses, and remote-fetch time are capped with explicit diagnostics.

Public repository inputs accept only canonical credential-free `https://github.com/owner/repository` URLs. FixMap disables credential helpers, inherited Git configuration, hooks, submodules, symlinks, and LFS smudging, then removes the checkout on success or failure. Public issue fetching uses GitHub’s fixed API host without credentials or redirects.

## Evidence, not hype

Most tools show you the benchmark they tuned on. Here is both.

![FixMap benchmark: the fixing file ranked in the top three for 9 of 12 held-out repositories never tuned against and 15 of 15 in the regression suite, with a 1.75-second median scan and rank.](docs/assets/fixmap-benchmark.svg)

FixMap is measured against real issues that were later fixed by a merged pull request. Each case pins the commit *before* the fix, feeds FixMap the issue text a maintainer actually wrote, and checks whether the file that fix changed appears in the ranking. Cases are chosen mechanically, and every input and output is checked in.

| | Held-out — 12 repos, **never tuned against** | Regression — 15 repos, guided development |
| --- | ---: | ---: |
| Fixing file ranked Top-1 | **8 / 12 (67%)** | 9 / 15 (60%) |
| Fixing file ranked Top-3 | **9 / 12 (75%)** | 15 / 15 (100%) |
| Fixing file ranked Top-5 | **9 / 12 (75%)** | 15 / 15 (100%) |

**Plan around the 75%, not the 100%.** The regression suite is where v0.7.1's ranking heuristics were developed — a case missed, the ranker changed. That makes it honest regression evidence and a bad generalization estimate. The held-out suite was selected by the identical frozen rule *after* the ranker was finished and has never been tuned against, so it is the number that predicts what happens on your repository.

The gap is worth reading closely. Top-1 does not degrade on unseen code — it is slightly *higher* there. Top-3 falls from 100% to 75%, and that drop is exactly what fitting bought on the tuned set. The three held-out misses are listed with their real rankings in [`benchmarks/heldout/`](benchmarks/heldout), not removed or explained away.

Held-out repositories: mongoose, immer, jest, knex, mocha, got, socket.io, svelte, vite, vue, winston, yargs. Regression repositories: Express, Axios, debug, ky, Zod, Pino, Fastify, Chalk, Vitest, ESLint, Webpack, Undici, Redux Toolkit, Prettier, Hono.

Median scan and rank across the pinned repositories is **1.75 s**, measured over three warm runs each.

**What is not claimed:** there is no tokens-saved or minutes-saved figure here. Establishing one honestly needs a controlled experiment running the same tasks with and without FixMap, which has not been done. Byte-based context-size proxies are recorded in [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md) and labeled as estimates, not savings.

Read the full [benchmark methodology and scanner measurements](docs/BENCHMARKS.md), or reproduce either suite yourself:

```bash
npm run evaluate:heldout
```

## What changed in v0.7.1

FixMap now grounds identifier-like task terms against repository text before using them as strong ranking evidence. Unresolved, partially resolved, and unverified identifiers are reported separately, and incomplete scans or flat rankings cap confidence instead of producing a misleading high-confidence map.

The grounding path includes regressions for paraphrased camelCase identifiers and identifiers beyond the 64 KB text-sampling boundary. Git-tracked vendored source remains rankable—Chalk's `source/vendor/supports-color/index.js` is still the Top-1 result in the external benchmark.

[Inspect the changelog](CHANGELOG.md) · [See the held-out results](benchmarks/heldout/README.md) · [See every regression ranking](benchmarks/external/README.md) · [Audit the efficiency assumptions](docs/BENCHMARKS.md)

## Watch it work

[![FixMap launch film preview: a terminal report showing the ranked reset-password context file, its related test route, and a high authentication risk note.](apps/web/public/fixmap-launch-poster.jpg)](https://fixmap-flax.vercel.app/#launch-film)

[Play the launch film](https://fixmap-flax.vercel.app/fixmap-launch.mp4) · [Explore the browser demo](https://fixmap-flax.vercel.app/#demo) · [Open the repository](https://github.com/aryamthecodebreaker/FixMap)

The website demo runs against a small browser-only sample. The CLI, MCP server, and Action scan real repositories.

## How ranking works

FixMap combines bounded, visible signals rather than one opaque score:

1. Normalize the issue, task text, repository input, and optional git diff.
2. Scan code, tests, documentation, and configuration while respecting ignore rules.
3. Rank path/content overlap, distinctive definition sites, changed files, import-graph proximity, nearby paths, and workspace ownership.
4. Route the closest package-level test command and related test files.
5. Report risk areas and diagnostics without executing the suggested commands.

The implementation lives in [`packages/core`](packages/core), shared by every interface.

## Repository layout

```text
packages/core     scanner, ranking, routing, reports
packages/cli      npx/CLI entry point and MCP server
packages/action   bundled GitHub Action
apps/web          interactive Next.js product site
benchmarks        transparent ranking evaluation cases
examples          inspectable sample input and output
```

## Develop locally

FixMap requires Node.js 20.11 or newer.

```bash
npm ci
npm run ci
```

`npm run ci` covers typechecking, tests, a high/critical production audit gate, linting, production builds, Action and MCP metadata, bundle drift, smoke tests, evaluations, and scanner correctness. Use `npm run benchmark:scan` for the non-gating performance benchmark.

## Current scope

FixMap is focused on JavaScript and TypeScript repositories. It does not claim that a ranked file is correct, execute suggested commands, or hide failed diff resolution.

Next priorities include:

- expanding the frozen cross-repository dataset beyond six cases
- adding co-change and ownership signals
- publishing more monorepo adapters and examples
- promoting a stable `v1` Action tag after wider acceptance testing

See [open issues](https://github.com/aryamthecodebreaker/FixMap/issues) for scoped work, or start with [CONTRIBUTING.md](CONTRIBUTING.md). Security reports belong in the process described by [SECURITY.md](SECURITY.md).

## License

MIT © FixMap contributors.

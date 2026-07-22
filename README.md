<div align="center">

# FixMap

**Give your coding agent a map before it starts editing.**

Turn an issue or git diff into relevant files, test routes, risk notes, and clear diagnostics.

[![CI](https://github.com/aryamthecodebreaker/FixMap/actions/workflows/ci.yml/badge.svg)](https://github.com/aryamthecodebreaker/FixMap/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40aryam%2Ffixmap)](https://www.npmjs.com/package/@aryam/fixmap)
[![MIT](https://img.shields.io/badge/license-MIT-74f0ba)](LICENSE)

[Live demo](https://fixmap-flax.vercel.app) · [Install](#quick-start) · [MCP server](#mcp-server) · [GitHub Action](#github-action) · [Contribute](CONTRIBUTING.md) · [Star FixMap](https://github.com/aryamthecodebreaker/FixMap)

</div>

<!-- Reproducible recording: regenerate with `npm run build:cli && node scripts/render-demo.mjs` -->
![Animated terminal recording: a single fixmap plan command on the checked-in tiny-auth example produces ranked context files with confidence and reasons, a test route with related tests, a high authentication risk note, and honest empty diagnostics — in about ten seconds.](docs/assets/fixmap-cli-demo.svg)

## Why FixMap?

Coding agents are fast once they have the right context. The expensive mistakes happen earlier:

- reading a plausible file instead of the owning module
- missing the test that would catch the regression
- treating an unresolved git diff as “no changes”
- leaving reviewers without a clear map of what should be verified

FixMap is a transparent routing layer for that gap. It needs no account or API key and never uploads repository source to a third-party service.

## Quick start

Paste a public GitHub issue URL. FixMap fetches its title and body, infers the repository, and returns a repo map without making you clone anything first:

```bash
npx -y @aryam/fixmap plan --issue https://github.com/aryamthecodebreaker/FixMap/issues/59
```

Or describe a task and point FixMap at any public GitHub repository:

```bash
npx -y @aryam/fixmap plan \
  --issue "support public GitHub issue URLs" \
  --repo https://github.com/aryamthecodebreaker/FixMap
```

For private source or working-tree changes, run it from a local JavaScript or TypeScript repository:

```bash
npx @aryam/fixmap plan --issue "password reset emails fail"
```

Use a real branch diff:

```bash
npx @aryam/fixmap plan --diff main...HEAD
```

Machine-readable output:

```bash
npx @aryam/fixmap plan --base main --head HEAD --format json --output fixmap-report.json
```

### Public GitHub issue and repository inputs

CLI and MCP users can pass a canonical `https://github.com/owner/repository/issues/123` URL as the issue. FixMap anonymously fetches the public issue title and body and infers the matching repository when `--repo` / `repo` is omitted. A separately supplied public repository URL must match the issue; an explicit local checkout is allowed.

Repository inputs use the canonical `https://github.com/owner/repository` form. FixMap anonymously shallow-clones the default branch into an isolated OS temporary directory, disables credentials, hooks, submodules, symlinks, and LFS smudging, scans without running install/build/test scripts, and removes the checkout before returning the report. Issue fetches use GitHub's fixed public API host with no redirects or credentials, a 15-second timeout, bounded response and task sizes, and a clear anonymous rate-limit error.

Remote URL mode is deliberately issue-only in this first release. Clone the repository locally when you need `--diff`, `--base`, or `--head`. Paths and test commands in a remote report are informational because the temporary checkout no longer exists after analysis.

Example result:

```text
## Context Files
- src/auth/reset-password.ts (high confidence): path and content match
- src/email/send-reset.ts (medium confidence): content match

## Test Route
- npm --prefix apps/api run test

## Risk Map
- high authentication: authentication-related files are affected
```

## MCP server

FixMap ships as a Model Context Protocol server, so coding agents can request a plan themselves instead of you pasting reports around. One tool is exposed: `fixmap_plan`.

Claude Code:

```bash
claude mcp add fixmap -- npx -y @aryam/fixmap mcp
```

Cursor, Windsurf, or any MCP client:

```json
{
  "mcpServers": {
    "fixmap": {
      "command": "npx",
      "args": ["-y", "@aryam/fixmap", "mcp"]
    }
  }
}
```

The agent calls `fixmap_plan` with an issue description or a diff spec (`main...HEAD`) and receives the same report as the CLI: context files with confidence and reasons, test routes, risk notes, and diagnostics. The `repo` argument accepts either a local path or a public GitHub HTTPS URL. Analysis runs locally over stdio; source is never uploaded by FixMap.

## Interactive demo

The [live website](https://fixmap-flax.vercel.app) includes a browser-only sample repository: change the task and watch the context pack update. It is deliberately labeled as a sample; the CLI scans real local repositories or isolated temporary checkouts of public GitHub repositories.

![The FixMap website on a desktop viewport: a hero that reads "Give your coding agent a map before it starts editing" next to a terminal mock of a fixmap report with context, verify, and risk sections.](docs/assets/fixmap-site-desktop.png)

Run the site locally:

```bash
npm ci
npm run dev -w @fixmap/web
```

## GitHub Action

Add FixMap to pull requests with a versioned release:

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
        uses: aryamthecodebreaker/FixMap@v0.6.1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Pin the Action to the latest [release tag](https://github.com/aryamthecodebreaker/FixMap/releases); a floating `v1` major tag is planned after wider acceptance testing. The Action upserts one marked PR comment, writes Markdown to the step summary, and exposes `report`, `context-count`, and `test-route-count` outputs.

### Permissions and forked pull requests

The workflow above grants `pull-requests: write` so FixMap can upsert its comment. On pull requests from forks, GitHub hands the workflow a read-only `GITHUB_TOKEN` regardless of that permissions block. FixMap detects the rejected comment call, emits a warning instead of failing, and keeps the job green — the full report is still in the step summary and the `report` output.

Do **not** switch the trigger to `pull_request_target` and check out the fork's head to restore commenting: that pattern runs untrusted pull-request code with a write-scoped token and is a well-known secret-exfiltration vector. If comments on fork PRs matter, keep this workflow read-only and post the comment from a separate trusted `workflow_run` job — or simply rely on the step summary.

## What it uses

The ranker is deterministic and inspectable:

- task and identifier overlap in paths and file samples
- real changed files from a resolved git diff, including untracked files in working-tree diffs
- `.gitignore`-aware scanning, so generated output does not outrank source
- static JavaScript/TypeScript import-graph proximity to high-confidence files
- code, test, documentation, and configuration classification
- nearby paths and workspace package boundaries
- npm, pnpm, Yarn, and Bun script routing
- explicit confidence and diagnostic messages

It intentionally does **not** claim correctness, execute suggested commands, or hide failed diff resolution.

## Evaluation

Ranking changes must pass a checked-in task-to-file evaluation gate in addition to unit tests:

```bash
npm run evaluate
```

The current suite covers Action failures, invalid diffs, authentication, the web demo, workspace test routing, and contributor documentation. The cases and full ranked results are visible in [`benchmarks/`](benchmarks).

A separate cross-repository evaluation runs FixMap against six real, already-fixed issues in permissively licensed repositories (Express, Axios, debug, ky, Zod, Pino) pinned to exact commits, and reports honest top-1/3/5 hit rates — currently 50% / 83% / 83%. The dataset, methodology, ranked outputs, and remaining Zod miss live in [`benchmarks/external/`](benchmarks/external); a scheduled workflow reruns it weekly.

## Repository layout

```text
packages/core     scanner, ranking, routing, reports
packages/cli      npx/CLI entry point and MCP server
packages/action   bundled GitHub Action
apps/web          interactive Next.js product site
benchmarks        transparent ranking evaluation cases
examples          inspectable sample input and output
```

## Development

Requires Node.js 20.11 or newer.

```bash
npm ci
npm run ci
```

`npm run ci` runs the complete test suite, typechecking, ESLint, production builds, Action bundle drift verification, CLI/Action smoke checks, the ranking evaluation gate, and a deterministic scanner correctness check. Scanner performance at large repository sizes is measured by `npm run benchmark:scan` and published in [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md) — timing is never a CI assertion.

## Status and roadmap

FixMap is an early public release focused on JavaScript and TypeScript repositories. The [changelog](CHANGELOG.md) records what each release shipped, including cross-repository evaluation, MCP support, and one-command public GitHub issue analysis. Near-term work:

- git co-change and ownership signals
- adapters and examples for popular monorepo layouts
- growing the cross-repository evaluation dataset beyond six cases
- stable `v1` Action tag after wider acceptance testing

See [open issues](https://github.com/aryamthecodebreaker/FixMap/issues) for scoped work. Contributions are welcome.

## License

MIT © FixMap contributors.

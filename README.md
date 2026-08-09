<div align="center">

# FixMap

Know where to edit before the first edit.

Paste a GitHub issue URL, describe a task, or point at a diff. FixMap returns ranked context files, reachable test commands, risk notes, and explicit diagnostics—without an account, API key, or model call.

[![CI](https://github.com/aryamthecodebreaker/FixMap/actions/workflows/ci.yml/badge.svg)](https://github.com/aryamthecodebreaker/FixMap/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40aryam%2Ffixmap)](https://www.npmjs.com/package/@aryam/fixmap)
[![GitHub release](https://img.shields.io/github/v/release/aryamthecodebreaker/FixMap)](https://github.com/aryamthecodebreaker/FixMap/releases/latest)
[![Marketplace](https://img.shields.io/badge/GitHub_Marketplace-FixMap-2ea44f?logo=github)](https://github.com/marketplace/actions/fixmap)
[![MIT](https://img.shields.io/badge/license-MIT-74f0ba)](LICENSE)

[Website](https://usefixmap.vercel.app) · [Live demo](https://usefixmap.vercel.app/demo) · [Documentation](https://usefixmap.vercel.app/docs) · [Evidence](https://usefixmap.vercel.app/evidence) · [Changelog](CHANGELOG.md)

</div>

![A generated FixMap CLI report showing ranked context files, test routes, risks, analysis, and diagnostics](docs/assets/fixmap-cli-demo.svg)

## Install

Requires Node.js 20.11 or newer.

```bash
npm install --global @aryam/fixmap@latest
fixmap plan --issue https://github.com/chalk/chalk/issues/624
```

For a one-off trial:

```bash
npx -y @aryam/fixmap@latest plan --issue https://github.com/chalk/chalk/issues/624
```

Install a discoverable `/fixmap` command for Claude Code, Cursor, GitHub Copilot, and Agent Skills:

```bash
fixmap setup
```

Type `/fixmap` with no task to see the full feature menu, or run `fixmap features` in a terminal. Use `fixmap setup --agent <name>` to install one integration, and `--force` only after reviewing an existing customized command.

FixMap fetches a public task, infers its repository, scans a temporary isolated checkout, and removes it when the report is complete. Local repository analysis never uploads source.

## Everyday workflow

Save a plan before editing:

```bash
fixmap plan --issue "password reset emails fail" --format json --output plan.json
```

Ask why an expected path is missing:

```bash
fixmap plan --issue "password reset emails fail" --explain src/auth/token.ts
```

Refine the task and compare the ranking:

```bash
fixmap plan --issue "sendMail throws during password reset" --compare plan.json
```

Verify the completed diff against the saved plan:

```bash
fixmap verify --report plan.json --diff main...HEAD
```

Validate a saved report before another tool consumes it:

```bash
fixmap validate plan.json
```

Use `--working-tree` for staged and unstaged tracked edits, `--include-untracked` when new files should count as changes, `--exclude` or `.fixmapignore` to focus the map, and `--no-cache` to force a fresh scan. Run `fixmap --help` for the complete command reference.

## Complete feature catalog

### Inputs and repository mapping

- Accepts a public GitHub issue or pull-request URL, plain task text, a UTF-8 `--issue-file`, or task text from stdin.
- Normalizes supported browser and GitHub API issue URLs, including `www`, query strings, and fragments, while rejecting credentials, lookalike hosts, ports, and unsafe encoded paths.
- Scans the current checkout, another local path, a `file://` URL, or an isolated checkout of a public GitHub repository.
- Maps `--diff <spec>`, `--base`/`--head`, or the current `--working-tree`; untracked changes remain opt-in with `--include-untracked`.
- Reuses repository scans only when the repository root, commit, status, and binary diff are identical. `cache-hit` reports reuse and scan age, entries expire after seven days, `--no-cache` reports a fresh bypass, and `FIXMAP_CACHE_DIR` moves the OS cache.
- Keeps the current `--issue-file`, `--compare`, `--report`, and `--output` artifacts out of repository ranking, change detection, and cache invalidation, so FixMap never recommends its own report as the fix site.
- Detects npm, pnpm, Yarn, and Bun projects and reads the scripts declared by each workspace package.

### Plan and ranking

- Ranks source, test, configuration, documentation, and other files from path terms, source content, identifiers, quoted fragments, file mentions, and real diff content.
- Recognizes JavaScript/TypeScript declaration tests, Go `_test.go`, Python `test_*.py` and `*_test.py`, common test directories, and framework single-file components.
- Deprioritizes lockfiles, backups, bundled output, examples, and generated counterparts when maintained source exists.
- Routes reachable test commands from real package scripts and pairs them with the nearest related test files.
- Reports six bounded risk areas: authentication, billing, automation, data, public API, and dependencies.
- Explains task grounding, ranking shape, unresolved or partially matched identifiers, exclusions, scan limits, unread content, skipped submodules, empty diffs, and Git failures.
- Supports `--limit`, repeatable `--exclude`, and ordered `.fixmapignore` patterns with negation. Root-leading patterns are repository-relative, pasted absolute paths inside the repository are normalized, and patterns that match nothing produce a warning.
- Produces Markdown for people or versioned JSON for tools, writes to `--output`, and gives one grounded next action.

### Explain, Compare, Verify, Validate, and Doctor

- **Explain** tells you whether a path ranked, fell below the cutoff, was excluded, resolves through a submodule, or was never scanned—and uses the same task and diff evidence as Plan.
- **Compare** shows files that entered, left, moved, or changed confidence after the task was refined, plus changes in task grounding.
- **Verify** compares a saved JSON plan with a diff or working tree and flags generated edits, unmapped changes, an untouched leading file, source changes without tests, newly reached risk areas, and plan/repository mismatches.
- **Validate** checks any saved JSON report with the structural compatibility validator shared by Compare, Verify, the Action, and MCP.
- **Doctor** prints the running version and executable path and diagnoses project, global, PATH, and npm-exec version shadows.
- `FIXMAP_PROGRESS` controls remote clone/scan progress, and `FIXMAP_VERBOSE_USAGE` restores full usage text after argument errors.

### Agent and automation interfaces

- `fixmap setup` installs `/fixmap` discovery for Claude Code, Cursor, GitHub Copilot prompt files, and the open Agent Skills layout; the no-argument command lists every FixMap workflow before making changes.
- The MCP server exposes `fixmap_plan`, `fixmap_explain`, `fixmap_compare`, `fixmap_verify`, and `fixmap_doctor` over local stdio and is published in the official MCP Registry.
- The GitHub Action runs Plan or Verify on pull requests, writes a full job summary, and creates or updates one bounded FixMap comment instead of posting duplicates.
- The Action accepts explicit task input or pull-request context, uses the same report validator as the CLI and MCP server, and fails clearly when a requested diff cannot be resolved.
- The browser demo runs the real core Plan, Explain, Compare, and Verify logic against a sample repository without uploading the task.

### TypeScript library

- `@aryam/fixmap-core` exposes repository scanning, exclusion resolution, ranking, task grounding, language and import-proximity analysis, test/risk routing, report validation, and Markdown/JSON rendering.
- Its public API also exposes Explain, Compare, and Verify builders and result types, so another tool can compose the same workflow without shelling out to the CLI.
- The `@aryam/fixmap-core/browser` entry runs the filesystem-free report, comparison, explanation, verification, and rendering logic in a browser bundle.

### Trust, compatibility, and evidence

- The core is deterministic and local-first: no account, API key, hosted model, source upload, dependency install, repository script, test execution, or Git hook.
- Public-repository analysis uses a temporary shallow checkout with credentials, inherited Git config, hooks, LFS smudging, symlinks, and submodule traversal disabled.
- `reportVersion: 1` defines the JSON compatibility boundary; additive fields are allowed, legacy unmarked reports remain accepted, and unsupported versions fail with an actionable message.
- Checked-in self, external, held-out, adversarial, and performance records power the evidence page; CI checks empty cohorts, confidence gates, generated-asset drift, Action bundle drift, and the 1,000-file benchmark.
- The documentation site includes the live demo, install paths, evidence with misses, release changelog, responsive navigation, keyboard focus, AA contrast, and a persistent system-aware light/dark theme.

## What the report contains

- Ranked context files with scores, confidence, and evidence.
- Test routes that correspond to commands the repository actually declares.
- Six bounded risk areas: authentication, billing, automation, data, public API, and dependencies.
- Diagnostics for uncertainty, unread content, scan boundaries, excluded matches, and unresolved diffs.
- A grounded next action that avoids generated counterparts when maintained source exists.

FixMap is deterministic. It narrows investigation; it does not prove that a ranking or change is correct.

## MCP server

Expose Plan, Explain, Compare, Verify, and Doctor over local stdio:

```bash
fixmap mcp
```

Example client configuration:

```json
{
  "mcpServers": {
    "fixmap": {
      "command": "fixmap",
      "args": ["mcp"]
    }
  }
}
```

See the [MCP setup guide](https://usefixmap.vercel.app/get-started#mcp) for client-specific instructions.

## GitHub Action

```yaml
name: FixMap
on: pull_request

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
      - uses: aryamthecodebreaker/FixMap@v0.8.8
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

The Action writes the complete report to the job summary and maintains one pull-request comment. Its checked-in bundle and metadata are release-gated.

## JSON compatibility

New plans include `"reportVersion": 1`. Within a report version, fields may be added, but existing fields are not removed or retyped; consumers should ignore unknown fields. Breaking output changes require a new report version. Compare and Verify continue to accept legacy plans without a marker and reject unsupported marker values.

## Evidence

The [evidence page](https://usefixmap.vercel.app/evidence) is generated from the checked-in held-out, regression, baseline, performance, and adversarial records. It publishes misses and confidence intervals alongside hits. CI rejects empty evaluation files, stale rendered artifacts, adversarial regressions, Action bundle drift, and benchmark drift.

## Safety boundary

FixMap reads and ranks. It does not install dependencies, run repository scripts, execute tests, invoke git hooks, upload local source, or call a hosted model. Remote clones disable credential helpers, inherited git configuration, hooks, submodules, symlinks, and LFS smudging.

See [SECURITY.md](SECURITY.md) for the trust model and reporting process.

## Develop locally

```bash
npm ci
npm run ci
```

The workspace contains the deterministic core, CLI/MCP server, GitHub Action, Next.js website, benchmarks, examples, and release scripts. Start with [CONTRIBUTING.md](CONTRIBUTING.md); architecture and full usage details live in the [documentation site](https://usefixmap.vercel.app/docs).

## Releases

Release notes live in [CHANGELOG.md](CHANGELOG.md) and on the generated [website changelog](https://usefixmap.vercel.app/changelog). The publish workflow verifies internal versions, npm packages, MCP Registry metadata, Action metadata and bundle, the GitHub release, and a clean installed CLI before a release is complete.

## License

[MIT](LICENSE)

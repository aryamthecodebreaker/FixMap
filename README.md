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

Use `--working-tree` for staged and unstaged tracked edits, `--include-untracked` when new files should count as changes, `--exclude` or `.fixmapignore` to focus the map, and `--no-cache` to force a fresh scan. Run `fixmap --help` for the complete command reference.

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

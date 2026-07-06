# FixMap

[![CI](https://github.com/aryamthecodebreaker/FixMap/actions/workflows/ci.yml/badge.svg)](https://github.com/aryamthecodebreaker/FixMap/actions/workflows/ci.yml)

FixMap is an open-source repo intelligence tool for developers using AI coding agents.

It does not try to replace Codex, Cursor, Copilot, Claude Code, or other coding tools. It helps them start in the right place, read the right files, run the right checks, and leave a clearer review trail.

## The Problem

AI coding tools are fast at producing changes, but developers still lose time on the same failure modes:

- the agent edits the wrong file because it lacks repo context
- a fix looks plausible but misses the test that would catch it
- reviewers cannot tell what was verified and what was guessed
- maintainers receive AI-generated PRs with no useful risk summary
- solo developers spend time re-explaining the same project structure to every tool

FixMap turns a repo, issue, prompt, diff, or pull request into a compact map of what matters.

## What FixMap Produces

For a given task, FixMap will produce:

- **Context Pack**: files and symbols an AI coding tool should inspect first
- **Test Route**: commands and test files most likely to validate the change
- **Risk Map**: areas that deserve human review before merge
- **Review Receipt**: a markdown summary of what was checked, what changed, and what remains unverified
- **Machine Output**: JSON for scripts, GitHub Actions, and other agents

The goal is simple: make AI-assisted development less about guessing and more about grounded verification.

## Who It Is For

FixMap is built for two groups first.

### Solo developers using AI coding tools

Run FixMap before handing a task to an agent:

```bash
fixmap plan --issue "Login works locally but fails in production"
```

FixMap returns the files to read, commands to run, and risks to watch. You can paste the output into Codex, Cursor, Claude Code, Copilot, or any other coding assistant.

### Open-source maintainers reviewing AI-generated PRs

Use FixMap in GitHub Actions to comment on pull requests:

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
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: aryamthecodebreaker/FixMap/packages/action@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

The action will explain which files look central, which tests should run, and where review attention should go.

## Why A Small Model Instead Of A Chatbot

FixMap is intentionally not another chatbot.

A tiny chatbot would compete with much larger models and lose. A small repo-routing model can still be useful because the job is narrower:

> Given this repo and this change, what context and checks are most likely to matter?

That makes the project realistic to train and run with normal developer infrastructure:

- GitHub for source, CI, releases, issues, and Actions
- Vercel for the website and playground
- CPU-only training from git history, changed files, tests, and CI metadata
- no hosted GPU requirement
- no paid API requirement for the core open-source tool

## Architecture

FixMap starts with a deterministic baseline and can grow into a small trainable ranking model once the report format and workflow prove useful.

```text
issue / prompt / diff / PR
        |
        v
repo scanner -> feature extractor -> file ranker -> test router
        |                                  |
        v                                  v
repo map                           markdown + JSON report
```

The MVP ranks files and tests using lightweight features:

- path and symbol overlap with the task
- test naming conventions
- changed-file signals from real git diffs
- content overlap from lightweight file samples
- nearby test naming and path overlap

Future releases can add dependency/import proximity, git co-change history, recent failures, and ownership or review hotspots.

The model artifact should be a small JSON file that can be committed, released, or regenerated in CI.

## CLI

```bash
fixmap plan --issue "Users cannot reset passwords"
fixmap plan --diff main...HEAD
fixmap plan --base main --head HEAD --format json
fixmap plan --issue "Users cannot reset passwords" --output fixmap-report.md
```

## MVP Usage

Try the CLI locally from the repository root:

```bash
npm install
npm run build
node packages/cli/dist/cli.js plan --issue "Users cannot reset passwords" --diff main...HEAD --repo .
node packages/cli/dist/cli.js plan --issue "Users cannot reset passwords" --format json --output fixmap-report.json
```

The MVP scans local repository files, reads package scripts, resolves real git diff specs, ranks likely context files, suggests test routes, and renders markdown or JSON output.

## Example

Run FixMap against the tiny auth example:

```bash
node packages/cli/dist/cli.js plan --issue "password reset emails fail" --repo examples/tiny-auth-app
```

You should see `src/auth/reset-password.ts` ranked as a context file, `test/auth/reset-password.test.ts` routed as a related test, and an authentication risk note. See [examples/reports/password-reset.md](examples/reports/password-reset.md) for a sample report.

## GitHub Action

The GitHub Action:

1. inspect the pull request diff
2. build or load the repo map
3. rank related files and tests
4. post a concise PR comment
5. writes the same report to the step summary

No source code will be sent to a third-party service by default.

For the first public release, use the Action from `main` until a `v0.1.0` tag is cut:

```yaml
- uses: aryamthecodebreaker/FixMap/packages/action@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Project Principles

- **Local first**: useful without accounts, keys, or external services
- **Review focused**: make human review faster and more factual
- **Agent compatible**: output should be easy to paste into any AI coding tool
- **Transparent**: show why files and tests were recommended
- **Small-model practical**: trainable on CPU and understandable by contributors
- **No magic claims**: FixMap suggests context and checks; it does not prove correctness

## Status

FixMap is in early MVP development. The CLI can scan a JavaScript or TypeScript repository and produce a context/test/risk report from a prompt or diff.

## Roadmap

- [ ] Repository scanner for file tree, package scripts, tests, imports, and git history
- [ ] CLI report generation in markdown and JSON
- [ ] Baseline ranker for context files and test routes
- [ ] GitHub Action for pull request comments
- [ ] CPU-trainable ranking model from repository history
- [x] Vercel-ready website and playground shell
- [x] Minimal example repository and sample report
- [ ] Examples for popular repo types

## License

FixMap is released under the MIT License. See [LICENSE](LICENSE).

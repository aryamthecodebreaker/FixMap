# Changelog

All notable changes to FixMap are documented here.

## 0.4.0 - 2026-07-15

### Added

- Static JavaScript/TypeScript import-graph proximity: files one or two import edges from a high-confidence context file are boosted with inspectable reasons such as `imported by ranked file <path>` (#12).
- Gated-test visibility: changed test files always appear in the test route's related files, and env-gated suites (`describe.skipIf(...)`) emit a `gated-test-skipped` diagnostic naming the enabling environment variable (#33).
- A pnpm + Turborepo workspace example proving nearest-package script routing, guarded by a report-drift smoke check in CI (#14).
- A deterministic scanner performance benchmark with published baselines in `docs/BENCHMARKS.md`; CI asserts scan correctness only, never wall-clock timing (#15).
- A reproducible cross-repository ranking evaluation: six real fixed issues in permissively licensed repositories pinned to exact commits, honest top-1/3/5 hit rates, and a weekly workflow (#13).
- A reproducible animated CLI demo at the top of the README, rendered from live CLI output on the checked-in example (#17), plus a desktop screenshot of the live site (#39).
- Marketplace branding metadata for the GitHub Action (#16).

### Fixed

- Files explicitly named in the task text now rank into context files, including test files, with an `explicitly named in the task` reason; JavaScript/TypeScript reserved words no longer count as content matches (#22).
- Diff risk severity is grounded in the files actually changed: risk areas matched only by ranked context report low severity with explicit wording instead of a false high-severity claim (#35).
- The GitHub Action stays green when comment permissions are read-only, as on forked pull requests: it warns, keeps the report in the step summary and outputs, and only fails on unexpected errors (#16).

### Changed

- README versioned prose is now version-neutral with changelog pointers, and the Action example pins the latest release tag (#34).

## 0.3.1 - 2026-07-13

### Fixed

- A nonexistent `--repo` path now fails with a clear error and nonzero exit instead of an empty success report; the MCP tool returns an error result for the same case (#21).
- Repository scans respect `.gitignore` in git repositories via `git ls-files`, so ignored build output such as `.vercel/` no longer outranks source files; `.vercel` and `.netlify` are also hard-ignored in non-git scans (#23).
- Common stop words ("not", "does") and stem fragments ("doe") no longer count as content matches, deployment-related tasks now rank root configuration files such as `vercel.json` and `package.json`, and lockfiles are excluded from context ranking (#22).
- An unresolvable diff ref with no `--issue` fallback now exits nonzero in the CLI and returns an error from the MCP tool instead of an empty success report (#25).
- Working-tree diff specs such as `--diff HEAD` now include untracked files in `changedFiles`, so brand-new files rank as changed context; commit-to-commit diffs are unchanged (#26).

## 0.3.0 - 2026-07-13

### Added

- MCP server mode: `fixmap mcp` runs a Model Context Protocol server over stdio, exposing the `fixmap_plan` tool to Claude Code, Cursor, Windsurf, and other MCP clients.
- `buildFixMapReport` in `@aryam/fixmap-core`: one call from task input to a complete report, now shared by the CLI, the GitHub Action, and the MCP server.

## 0.2.1 - 2026-07-10

- Publish the CLI and core packages under the verified npm account scope, `@aryam`.
- Correct install commands and package links without changing v0.2 engine behavior.

## 0.2.0 - 2026-07-10

### Added

- File-kind-aware ranking with confidence levels.
- Workspace-aware npm, pnpm, Yarn, and Bun test routing.
- Visible diagnostics for invalid git diffs, invalid package manifests, and scan limits.
- Machine-readable GitHub Action outputs.
- Checked-in ranking evaluation cases and CI gate.
- Interactive product demo and social preview image.
- Scoped npm package manifests for one-command CLI usage.

### Changed

- Reduced documentation and configuration noise for code-focused tasks.
- Limited large repository scans and expanded ignored generated directories.
- Upgraded the web app to stable patched Next.js and React releases.
- Replaced the broken Next.js lint command with ESLint.

## 0.1.0 - 2026-07-09

- First public deterministic CLI and GitHub Action MVP.

# Changelog

All notable changes to FixMap are documented here.

## 0.6.2 - 2026-07-22

### Security

- Updated Next.js to 16.2.11 and pinned patched Sharp/libvips and `fast-uri` releases, clearing all high-severity production audit findings.
- Added a production audit gate that fails CI on high or critical advisories. The remaining two moderate findings come from the MCP SDK's unused HTTP static-file adapter; FixMap exposes only the SDK's stdio transport and does not import or run that adapter.

## 0.6.1 - 2026-07-22

### Fixed

- Shortened the MCP Registry description to its 100-character limit so the official registry publication can complete.
- Added a repository CI check and release preflight validation for MCP server metadata, preventing registry-only constraints from failing after npm packages have already published.

## 0.6.0 - 2026-07-22

### Added

- CLI and MCP users can paste a canonical public GitHub issue URL as the issue input. FixMap anonymously fetches its title and body and infers the matching repository when no repository is supplied.
- A `remote-issue-fetched` diagnostic records the exact issue source and whether its body was truncated before ranking.

### Security

- Issue URL inputs accept only credential-free canonical HTTPS URLs on `github.com`; queries, fragments, encoded separators, and mismatched explicit repository URLs are rejected.
- Issue content is fetched only from the fixed `api.github.com` endpoint without redirects or credentials, with a 15-second timeout, a bounded API response, a 20,000-character body cap, stable rate-limit errors, and explicit pull-request rejection.

### Changed

- The README, npm package page, MCP tool description, growth kit, and production quick start now lead with the single-input public issue workflow.

## 0.5.1 - 2026-07-18

### Added

- Root GitHub Action metadata enables the shorter `uses: aryamthecodebreaker/FixMap@v0.5.1` install path and makes the repository eligible for a Marketplace listing.

### Fixed

- File mentions now bridge JavaScript build paths to their TypeScript source equivalents, so a task naming `core/Ky.js` can rank `source/core/Ky.ts` as explicit context.
- Import-graph proximity can no longer boost a neighbor above the higher-scoring seed that supplied the evidence.
- Example/demo files and TypeScript declaration files are deprioritized for runtime implementation tasks, while tasks that explicitly target them keep the normal ranking behavior.
- Evaluation failures now print hit rates as real percentages instead of decimal fractions followed by a percent sign.

### Changed

- The frozen six-repository evaluation now measures 50% top-1, 83% top-3, and 83% top-5, up from 33% / 33% / 67% on v0.5.0. Zod #5944 remains the documented miss.
- Exact per-case external rankings are now checked in, and scheduled/release runs fail if live output drifts from that reviewed artifact.
- Package and MCP descriptions now lead with deterministic local-first analysis and public GitHub URL support.
- Release publishing now gates on the external evaluation and builds the GitHub release body from the matching changelog section.

## 0.5.0 - 2026-07-18

### Added

- One-command public GitHub repository analysis in the CLI and MCP server: pass a canonical `https://github.com/owner/repository` URL as the repository input and FixMap will scan an anonymous depth-one temporary checkout (#54).
- An informational `remote-repo-fetched` diagnostic records the canonical source URL, default branch, and fetched commit so remote reports remain reproducible.

### Security

- Remote inputs accept only credential-free HTTPS URLs on `github.com`. Git credential and askpass helpers, inherited Git configuration and tokens, hooks, submodules, symlinks, and LFS smudging are disabled for the temporary checkout.
- Temporary checkouts are removed on success, clone failure, or analysis failure. Cleanup failure is a hard error rather than a successful report with source left on disk.

### Changed

- Remote URL mode is explicitly issue-only; diff analysis continues to require a local checkout with the requested refs.
- Published package metadata now includes homepage, issue tracker, and discovery keywords.
- Release publishing now validates the selected tag and every version field, verifies npm and MCP Registry artifacts before creating the public GitHub release, and includes the MIT license in both npm packages.
- Public copy describes FixMap output as an explainable report rather than claiming checks were executed as a review receipt.

## 0.4.1 - 2026-07-16

### Added

- Official MCP Registry metadata and OIDC publication, allowing MCP directories to discover `io.github.aryamthecodebreaker/fixmap`.

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

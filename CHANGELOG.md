# Changelog

All notable changes to FixMap are documented here.

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

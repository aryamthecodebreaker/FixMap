# Changelog

All notable changes to FixMap are documented here.

## 0.7.4 - 2026-07-31

### Fixed

- Definition sites now outweigh vocabulary-dense consumers, regex quantifiers contribute searchable repeated tokens, and example/demo/presentation surfaces receive a meaningful task-aware penalty (#102, #105, #128).
- URL scheme and host text no longer becomes ranking evidence; unsupported standalone GitHub PR, discussion, compare, tree, and file URLs fail clearly; issue URLs are checked against local or remote repository identity (#109, #112, #113).
- Short trailing-e words no longer collapse into three-letter noise stems, and generic improve-the-codebase wording is classified as vague and returns no edit list (#106, #108).
- Homogeneous repositories keep task vocabulary when boilerplate filtering would otherwise remove every query term (#119).
- Empty, vague, low-confidence, clustered, remote, and saved plans now receive accurate next-step guidance. Verify hints preserve explicit repository/diff context and never invent `main...HEAD`; empty diffs without task text fail clearly (#104, #110, #111, #121, #127).
- `--explain` distinguishes score ties outside the top-N limit from files that actually scored below the reporting floor (#116).
- Tracked generated release artifacts such as `packages/action/dist/index.mjs` produce a rebuild warning instead of a discarded-edit error (#107).
- The GitHub Action fetches canonical issue URLs before ranking, rejects cross-repository issue input, and accepts format values case-insensitively while rejecting invalid values (#123, #124).
- MCP trims whitespace-only inputs and rejects them as missing task signals (#125).
- Issue-only risk notes use low severity and prospective wording; full severity is reserved for diff evidence (#126).
- Reports with code context but no supported test runner emit an explicit `no-test-route` diagnostic, including Python guidance (#114).
- The web demo now describes the measured `sendMail` ranking rather than implying the transport file wins (#129).

### Added

- `--issue-file <path>`, `--issue -` stdin, and `--issue @path` support large/private task text without Windows command-line limits; duplicate `--issue` flags now fail instead of silently using the last value (#115, #117, #118).
- MCP now exposes `fixmap_verify`, closing the plan-edit-verify loop for MCP-only agents (#120).
- The README documents the npm/npx stale-global-shim failure mode and the unambiguous `npm exec --package ... -- fixmap` invocation (#103).

### Evidence

- Refreshed all recorded evaluation outputs after the ranking changes. The untouched held-out suite remains 9/12 Top-3 (75%) and is now 7/12 Top-1 (58%); the development regression suite improves to 10/15 Top-1 (67%) while remaining 15/15 Top-3/5. The adversarial suite remains 8/8 with zero false-confidence cases.

## 0.7.3 - 2026-07-26

### Added

- `fixmap verify --report <file> --diff <spec>` closes the loop after an edit. It compares a saved plan against the diff that followed and reports five things: edits in generated or retired locations that the next build discards, files the change needed that the plan never ranked, an untouched leading file, source moving with no test moving, and risk areas the plan never flagged. Both inputs are things the user already has, so nothing is executed and no repository code runs. Only a discarded edit exits non-zero — that one is wrong regardless of the task, while everything else is advisory, because a plan can be wrong and a change can still be right. Available as `verifyPlan` from the core package and with `--format json`.

### Fixed

- Test routes list only the tests each command can actually run. `findRelatedTests` ran once and its result was assigned to every route, so a report claimed `npm --prefix packages/core run test` would exercise `packages/action/test/runner.test.ts`, which that command never reaches. On this repository all three routes carried an identical eight files spanning three packages. Related files are now scoped to the route's package directory; a repository-root script keeps everything.

## 0.7.2 - 2026-07-26

### Added

- `plan --explain <path>` answers the question a ranked list cannot: why a file you expected is missing. It separates the cases that actually differ — ranked, scored below the cutoff, deliberately excluded as a test or lockfile or generated output whose source was ranked instead, or never scanned. A scan that hit its file limit says so rather than implying the path does not exist. Available as `explainFile` from the core package and as `--format json`.
- Every published hit rate now carries a 95% Wilson confidence interval. At twelve cases one result flipping moves Top-3 by eight points, so the point estimates read far more precisely than the evidence supports: held-out Top-3 is 75% with an interval of 47–91%. The README says so rather than quoting two significant figures.
- Both evaluations report a misleading-top-result rate: how often a wrong file ranks first while the right one sits lower in the window. Held-out is 1/12; the regression suite is 6/15, which its 100% Top-3 had been hiding. This is what an agent actually pays for, since it opens the first file.

### Fixed

- Committed minified bundles no longer compete with the source a task is about. Repositories ship pre-bundled third-party dependencies — Next.js keeps them under `src/compiled/` — and because they have no first-party counterpart the generated-duplicate rule keeps them, while their minified text contains the exact symbol names being searched for. A 30 KB single-line bundle ranked at high confidence, one point behind the real implementation, and even earned the definition-site boost. Files averaging 400+ characters per line are now deprioritized. The check reads content rather than paths, so readable vendored source of any length is untouched and chalk's `source/vendor/supports-color/index.js` still ranks first.

- Vague-task detection no longer misses a wordy request. It gated on five task tokens or fewer, so "clean this up and make the general performance better overall" was classified as descriptive purely for being longer than "improve DX". Vagueness is now judged by how little survives removing generic-improvement vocabulary, which also keeps a concrete request that merely asks for an improvement out of the bucket. The adversarial suite found this and now asserts the label strictly.
- A truncated scan says what it did not read. Hitting the file cap reported only that scanning stopped; it now names the busiest unread directories — "3,000 paths went unread, mostly under web/ (3,000)" — so a reader can judge whether the omission touched the code their task is about. Git checkouts get the exact remainder; a plain directory walk has no complete list to report from and keeps the shorter message.

### Added

- Confidence is now calibrated rather than asserted. Both evaluation suites record the top-ranked file's confidence label, and the summary reports how often each label was correct. Across all 27 cases a top result labeled high confidence is the right fixing file 11/15 of the time, medium 5/8, and low 1/4. The ordering holds, so the label carries information — but high means roughly three in four, not certainty, and the counts are published because bands this small cannot support a precise percentage.
- Added an adversarial suite measuring the opposite failure to accuracy: fabricated identifiers, real identifiers from the wrong repository, vague requests, absent feature surfaces, runtime-only symptoms, and generic-term floods, run against real pinned repositories. False-confidence rate is 0.0 across 8 cases. Unit tests cannot replace this — FixMap's own fixtures contain the fabricated identifiers, so a suite pointed at this repository would resolve them and pass while the behavior was broken. `npm run evaluate:adversarial:gate`.
- The `fixmap_plan` MCP tool description and the README now tell an agent how much to trust the output: check the analysis block, verify identifiers resolved, widen the search when grounding is weak, and never edit a file only because it ranked highly.
- Published example reports for the three ways FixMap declines to answer — fabricated identifiers, a vague request, and terms that match nothing — so the examples directory no longer shows only successful routings. Regenerate with `npm run render:examples`.

- Added a held-out evaluation suite: 12 MIT-licensed repositories selected by the same frozen rule as the regression suite, but chosen **after** the v0.7.1 ranker was finished and never tuned against. It measures 67% Top-1 and 75% Top-3/5, against 60% / 100% / 100% on the regression suite. Top-1 does not degrade on unseen repositories; the Top-3 gap is what fitting bought on the tuned set. Run it with `npm run evaluate:heldout`.
- `scripts/evaluate-external.mjs` accepts `--suite external|heldout`, so both suites share one harness and one recorded-result format.

### Changed

- The README now reports held-out and regression figures side by side and states plainly that the 75% is the number to plan around. The previously advertised 100% Top-3 was measured on the cases that guided development and was never a generalization estimate.
- The benchmark card no longer headlines a "98.6% fewer tokens" context proxy or a "14.97 minutes saved" comparison. Both compared against assumed baselines rather than measurements — no agent reads an entire repository, and no with/without-agent experiment was run — so a reader had no way to tell the honest numbers on the card from the invented ones. Byte-based context proxies remain recorded and labeled in `docs/BENCHMARKS.md`.
- `benchmarks/external/` is documented as a regression suite rather than an accuracy claim.

## 0.7.1 - 2026-07-26

### Fixed

- Scanning a git checkout no longer discards first-party source that happens to sit in a conventionally generated directory. `git ls-files --exclude-standard` already applies `.gitignore`, so re-applying a hardcoded directory blocklist on top only removed files the author had deliberately committed. Asked to route `handle chalk color detection on windows terminals`, FixMap missed `source/vendor/supports-color/index.js` — chalk's only implementation of that behavior — and reported no diagnostic explaining the omission. It now ranks first. Directory walks outside a git checkout have no `.gitignore` to consult and still skip those directories.
- A term is treated as repository-wide boilerplate only when at least 85% of files carry it, rather than half. The old cutoff mistook subject matter for boilerplate: chalk names "color" in 55% of its files, so a color-detection task had its only search term suppressed and returned nothing.
- Generated output is excluded from ranking when the source it was built from is present, because the next build overwrites any edit made there. A committed bundle no longer crowds out the module it was produced from. Vendored code with no maintained counterpart stays rankable, and naming a build artifact explicitly still surfaces it.
- Backup directories and tool-left duplicate filenames are deprioritized, so an agent is not routed into a retired copy. A `.bak`, `conflicted copy`, or `quarantine/` snapshot no longer outranks the file still in use.

### Added

- An empty report now explains itself instead of printing "Diagnostics: None found". FixMap distinguishes task text that produced no searchable term from terms that matched no file, and names the terms it searched for.
- Added repository-grounded identifier analysis to reports. Exact, partial, unresolved, and unverified identifiers are distinguished before ranking confidence is assigned.
- Added regressions for paraphrased camelCase identifiers and identifiers beyond the 64 KB text-sampling boundary, preventing grounding from suppressing useful component words or claiming absence from incomplete evidence.
- Expanded the frozen external benchmark from 6 to 15 pinned repositories and added a reproducible scan/runtime/context-size benchmark plus an exact SVG result card.

### Changed

- Improved the freshly measured 15-repository baseline from 40% / 67% / 67% to 60% / 100% / 100% Top-1/3/5. The baseline was run against the same frozen cases rather than read from the previously stale results file.
- Confidence is capped when identifier grounding is incomplete, task text is vague, the repository scan is incomplete, or the ranking is too flat to justify certainty.
- Ranking now recognizes member references, type-focused tasks, HTTP/2-to-`h2` naming, explicit nested paths and repeated literals while filtering unchecked issue-template options.
- The efficiency benchmark labels byte-derived token figures as estimates and the manual-triage comparison as an assumption, not a controlled agent experiment.
- Re-recorded `benchmarks/external/results.json` with all 15 exact Top-5 rankings.

## 0.7.0 - 2026-07-22

### Added

- Added bounded, explainable definition-site ranking for distinctive task identifiers and exact code or literal fragments, including truncated literals from issue excerpts.
- Added focused regressions for exact literal extraction, generic-identifier noise, and definition-site ranking.

### Changed

- Improved the frozen six-repository evaluation from 50% / 83% / 83% top-1/3/5 to 67% / 100% / 100%. The unchanged Zod #5944 case now ranks its fixing `regexes.ts` file first.

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

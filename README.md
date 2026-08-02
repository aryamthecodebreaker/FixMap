<div align="center">

# FixMap

### Know where to edit before the first edit.

Paste a GitHub issue URL, describe a task, or point at a diff. FixMap returns ranked context files, test routes, risk notes, and explainable diagnostics—without an account, API key, or model call.

[![CI](https://github.com/aryamthecodebreaker/FixMap/actions/workflows/ci.yml/badge.svg)](https://github.com/aryamthecodebreaker/FixMap/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40aryam%2Ffixmap)](https://www.npmjs.com/package/@aryam/fixmap)
[![GitHub release](https://img.shields.io/github/v/release/aryamthecodebreaker/FixMap)](https://github.com/aryamthecodebreaker/FixMap/releases/latest)
[![Marketplace](https://img.shields.io/badge/GitHub_Marketplace-FixMap-2ea44f?logo=github)](https://github.com/marketplace/actions/fixmap)
[![MIT](https://img.shields.io/badge/license-MIT-74f0ba)](LICENSE)

[Try one command](#one-command-start) · [Watch the 24-second film](https://usefixmap.vercel.app/fixmap-launch.mp4) · [Install the Action](https://github.com/marketplace/actions/fixmap) · [Connect MCP](#mcp-server) · [Contribute](CONTRIBUTING.md)

</div>

## One-command start

Give FixMap a public GitHub issue. It fetches the task, infers the repository, scans an isolated temporary checkout, and removes that checkout when the report is complete:

```bash
npx -y @aryam/fixmap@latest plan --issue https://github.com/chalk/chalk/issues/624
```

No clone, signup, configuration, or source upload is required. The CLI requires Node.js 20.11 or newer. The GitHub Action declares `using: node24`, which is the runtime GitHub supplies on its runners and places no requirement on your own Node version.

### Installing

`npx` fetches FixMap for that run and leaves nothing behind, which is the right default for trying it. Once it is part of your routine, install it and drop the `npx -y` prefix:

```bash
npm install -g @aryam/fixmap
```

Or pin it to one project, so everyone working on that repository gets the same version:

```bash
npm install --save-dev @aryam/fixmap
```

A project install is reached with `npx fixmap` inside the repository, or from an npm script.

#### Safe PowerShell test project

The directory must exist before `Set-Location` succeeds. This complete sequence creates a
scratch project first, stops on either directory error, installs FixMap in that project,
and proves the resolved version:

```powershell
$fixmapTestPath = Join-Path $env:USERPROFILE "fixmaptesting"
New-Item -ItemType Directory -Path $fixmapTestPath -Force -ErrorAction Stop | Out-Null
Set-Location $fixmapTestPath -ErrorAction Stop
npm init -y
npm install --save-dev @aryam/fixmap
npx fixmap --version
npx fixmap plan --issue "password reset emails fail"
```

If `npm install` inside a *source checkout* of this repository fails with `ENOTEMPTY` on a phosphor-icons path, a previous install left a partial directory behind: delete `node_modules` and rerun. This affects contributors building from source on Windows, never anyone installing the published package.

If `cd` or `Set-Location` fails, do not run the project-scoped `npm install` yet: PowerShell
stays in the previous directory, so npm will install there. Run `Get-Location`, create or
select the intended project directory, and then install.

If an older FixMap is installed globally, some npm/npx combinations on Windows resolve the old global `fixmap` shim even when a version is pinned — so a feature that shipped looks like it never existed. `fixmap doctor` detects exactly this and exits non-zero:

```bash
npx -y @aryam/fixmap@latest doctor
```

Remove the stale copy with `npm uninstall -g @aryam/fixmap`, or test an exact version in an isolated prefix and invoke that prefix's shim directly. This PowerShell sequence cannot be redirected to an older package in the current directory or one of its parents:

```powershell
$fixmapPrefix = Join-Path $env:TEMP "fixmap-cli-0.8.3"
npm install --global --prefix $fixmapPrefix @aryam/fixmap@0.8.3
& "$fixmapPrefix\fixmap.cmd" --version
```

On macOS or Linux, use `fixmapPrefix="$(mktemp -d)"`, install with the same `--prefix`, and run `"$fixmapPrefix/bin/fixmap" --version`.

| Command | Answers |
| --- | --- |
| [`fixmap plan`](#cli) | Which files, tests, and risks should I look at first? |
| [`fixmap plan --explain <path>`](#ask-why) | Why is the file I expected *not* in that list? |
| [`fixmap plan --compare <file>`](#measure-a-better-task) | Did refining the task move the real file up? |
| [`fixmap verify`](#verify-the-change-afterwards) | Did the change I made match the plan? |
| [`fixmap doctor`](#check-the-install) | Am I running the version I asked for? |
| [`fixmap mcp`](#mcp-server) | The same report, requested directly by an agent |

The CLI points at the next useful command as you go, so `--explain` and `verify` surface when they apply rather than only living here.

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

Remote repository mode is issue-only, and deliberately so: the checkout is a single-commit shallow clone of the default branch, which has no history for a diff range to resolve against and no working tree to compare. Passing `--diff`, `--base`/`--head` or `--working-tree` with a GitHub URL fails immediately and says this, rather than cloning first and then reporting an unresolvable ref.

That clone is also the expensive part of a remote run — minutes on a large monorepo, for a ranking that is lexical. If you already have the repository on disk, pass `--repo .` with the issue URL and FixMap will rank against your checkout instead of fetching its own:

```bash
npx -y @aryam/fixmap@latest plan --issue https://github.com/owner/repository/issues/123 --repo .
```

Set `FIXMAP_PROGRESS=1` when you want clone/scan progress; `true`, `yes`, and `on` work too, and `0`/`false`/`no`/`off` silence it even in a terminal, where it is otherwise on by default. Progress is intentionally written to stderr so JSON/stdout remains pipe-safe; in PowerShell, merge it for display with `2>&1` or suppress it with `2>$null` if your host records native stderr as an error stream. The same applies to the next-step hints printed after a successful plan — they are stderr, not failure. `FIXMAP_VERBOSE_USAGE=1` restores the full usage block after every argument error.

### Which URLs and paths are accepted

`--issue` takes a public GitHub issue or pull request URL. A `?query`, a `#fragment`, and a `www.` or `api.` host are normalized away, so a URL copied from a browser or an API client works as-is. Other hosts, embedded credentials, and explicit ports are rejected, as are compare, tree, discussion, and file URLs — they carry no task text to rank.

`--repo` takes a local path, a `file://` URL, `https://github.com/owner/repository`, or a `git@github.com:owner/repository.git` SSH form, which is rewritten to the public HTTPS URL. FixMap only reads public repositories over HTTPS; the SSH form is accepted because it identifies the same repository, not because credentials are used.

Every relative path — `--repo`, `--issue-file`, `--issue @file`, `--output` — resolves against the **current working directory**, never against each other. `--issue-file ../task.md --repo ./checkout` reads the task from the parent of your shell's directory and scans `checkout` inside it.

For long or private task text, avoid shell command-length limits by reading UTF-8 text from a file or stdin:

```bash
npx -y @aryam/fixmap@latest plan --issue-file task.md
Get-Content task.md -Raw | npx -y @aryam/fixmap@latest plan --issue -
```

`--issue @task.md` is also accepted as a file shorthand. Repeated `--issue` flags are rejected instead of silently discarding the earlier task.

### Ask why

Every report explains the files it chose. `--explain` answers the harder question — why a file you expected is missing:

```bash
npx -y @aryam/fixmap@latest plan --issue "password reset emails fail" \
  --explain src/billing/invoice.ts
```

Explain accepts repository-relative paths, normalized `.`/`..` segments, or an absolute path inside the selected repository. It resolves the scanned casing on case-insensitive Windows checkouts and clearly rejects paths outside the repository. Git-tracked symlink paths are followed when the operating system permits them; a disabled or dangling Windows symlink is reported as not scanned.

```text
# Why src/billing/invoice.ts

Scored 2, below the lowest reported score of 24. Name a symbol, error string,
or path from this file in the task to raise it.
```

It distinguishes the cases that actually differ: the file was ranked, it scored below the cutoff, it was deliberately excluded (a test, a lockfile, generated output whose source was ranked instead), or the scan never saw it. When a scan hits its file limit, it says so rather than implying the path does not exist. Add `--format json` for the machine-readable form.

### Measure a better task

The habit worth having is: plan, add the identifier the task was missing, re-plan, and check whether the real file rose. `--compare` prints that instead of leaving you to diff two JSON files by eye:

```bash
npx -y @aryam/fixmap@latest plan --issue "ranking confidence" \
  --format json --output before.json

npx -y @aryam/fixmap@latest plan \
  --issue "confidenceForEntry gives every top-8 file high confidence" \
  --compare before.json
```

```text
2 entered, 2 left, 6 moved. The leading file changed from
scripts/evaluate-adversarial.mjs to packages/core/src/rank.ts.

Task grounding changed from **descriptive** to **anchored**.

## Moved
- `packages/core/src/rank.ts` rose from rank 2 to 1, score 9 to 42, confidence medium to high
```

That is FixMap's own feedback loop, measured in one command: naming a symbol moved the fix site from second place to first and turned a descriptive task into an anchored one.

### Keep the noise out

Demo pages, marketing copy, and documentation often contain every symptom word a product documents, so they compete with the implementation. FixMap's built-in penalties cover conventions like `examples/`; a repository's own layout it cannot know:

```bash
npx -y @aryam/fixmap@latest plan --issue "password reset emails fail" \
  --exclude apps/web --exclude 'docs/**' --limit 3
```

Patterns can also live in a `.fixmapignore` file at the repository root, one per line. FixMap supports the documented subset `*`, `**`, `?`, root-leading `/`, directory-trailing `/`, `#` comments, and ordered `!` negation; bracket characters are literals, not character classes, and FixMap does not claim every gitignore extension. Patterns use `/` as the separator on every platform, and a Windows-style `src\app` is normalized to `src/app` so a path pasted from Explorer or PowerShell still matches — which also means `\` does not escape anything. File and CLI patterns combine and are deduplicated. Omitting MCP `exclude` means “use `.fixmapignore` only”; sending patterns adds to that file. `--explain` reports an excluded file as excluded, naming the effective pattern, rather than claiming it scored too low.

`--limit` caps how many context files come back. The useful signal is usually the top one to three; the rest burns agent context and invites drive-by edits.

To map what you are editing right now, without crafting a git spec:

```bash
npx -y @aryam/fixmap@latest plan --working-tree --issue "reset flow"
```

That means staged and unstaged tracked changes against `HEAD`. Untracked files stay out of the **change set** unless you add `--include-untracked`, so agent metadata and scratch files are not reported as edits.

They are still ranking candidates. The repository scan reads `git ls-files --others --exclude-standard`, so a new file you just wrote can appear in the context list without appearing in `changedFiles` — which is what you want, since a file an agent created moments ago is usually the most relevant thing in the repository. `--include-untracked` governs which files count as *changed*, not which files can be ranked.

### Verify the change afterwards

`plan` answers where to start. `verify` answers whether the change that followed matches the plan — by comparing the saved report against a real git diff:

```bash
npx -y @aryam/fixmap@latest plan --issue "password reset emails fail" \
  --format json --output fixmap-report.json

# ...make the change...

npx -y @aryam/fixmap@latest verify --report fixmap-report.json --diff main...HEAD
```

```text
FixMap verified 3 changed files against the plan and raised 1 error and 2 warnings.

- **error** A file was edited in a generated or retired location. A build regenerates
  these, so the change will be lost. Edit the source they are produced from.
  - `dist/auth/reset-password.js`
- **warning** One file changed that the plan did not rank. Either the task grew beyond
  the original description, or the ranking missed them — worth checking which.
  - `src/billing/charge.ts`
- **warning** Code changed but no test did. The plan routed this test as most related.
  - `test/reset-password.test.ts`
```

It checks five things: edits in generated or retired locations, files the change needed that the plan never ranked, an untouched leading file, source moving with no test moving, and risk areas the plan never flagged. Nothing is executed — both inputs are things you already have.

Only a discarded, untracked generated edit exits non-zero. A committed generated release artifact is a warning: confirm its maintained source changed and it was rebuilt. Everything else is advisory because a plan can be wrong and a change can still be right.

### Check the install

An older global install can shadow the version npm was asked for, so a feature that shipped appears not to exist. `doctor` says which version is actually running and why:

```bash
npx -y @aryam/fixmap@latest doctor
```

```text
# FixMap Doctor

- ok  Running version: 0.8.3
- PROBLEM  Global install: 0.3.1 (this process is 0.8.3)
    A globally installed fixmap shadows the version npx was asked for. Run
    `npm uninstall -g @aryam/fixmap` or update the global installation. For a
    clean pinned run, use the isolated-prefix command above.
- ok  Node version: 24.13.0
```

It exits non-zero when it finds a shadow, so a CI step fails rather than reading on.

Doctor compares the running package, the first `fixmap` shim on `PATH`, npm's global package, and an exact version requested through npm exec. It exits non-zero if npm requested one version but an older local or ancestor install ran instead. It cannot infer a version intended in some unrelated shell command or inspect every historical npm-exec cache entry; when reproducibility matters, use the isolated-prefix command above and invoke its shim directly.

### MCP server

FixMap exposes five stdio tools: `fixmap_plan` builds the starting map, `fixmap_explain` answers why a file is missing, `fixmap_compare` measures whether better task context improved the plan, `fixmap_verify` compares that plan with the later diff, and `fixmap_doctor` diagnoses install shadows.

`fixmap_plan` takes `limit` to cap how many context files come back, which matters when the useful signal is the top one to three and the rest is context budget. `fixmap_verify` and `fixmap_compare` both accept a report either inline or as a path to a saved JSON file, so a large plan need not be re-embedded in the tool call. `fixmap_explain` takes the same scan options as `fixmap_plan` — `diff`, `base`/`head`, `workingTree`, `includeUntracked` — so an explanation can be asked against exactly the plan that was just run. `format` is case-insensitive on every tool. `fixmap_doctor` sets `isError` when the install is unhealthy, so a client branching only on that flag still sees a shadowed install.

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

The official MCP Registry identifier is `io.github.aryamthecodebreaker/fixmap`. MCP exposes `fixmap_plan`, `fixmap_explain`, `fixmap_compare`, `fixmap_verify`, and `fixmap_doctor`, including working-tree and limit controls. Analysis runs locally over stdio; FixMap does not send repository source to a hosted model or service.

#### Tell the agent how much to trust it

The `fixmap_plan` tool description carries this guidance, so most clients pick it up automatically. Add it to your agent's system prompt when you want it enforced:

```text
Treat FixMap's output as a starting map, not proof that the task is valid.

1. Check the analysis block first. If it reports unresolved or unverified
   identifiers, vague task grounding, an incomplete scan, or a clustered
   ranking, do not assume the top-ranked file is correct.
2. Verify that identifiers, error strings, commands, and paths named in the
   task were actually found in the repository.
3. When no strong anchor resolves, search more broadly or ask for
   clarification before editing.
4. Prefer changed files, exact definitions, imports, and tests over generic
   keyword matches.
5. Never edit a file only because it ranked highly. Confirm the code there
   relates to the requested behavior.
```

This matters because the ranking is a lead, not a conclusion: across the frozen suites, a top result labeled *high confidence* is the correct fixing file 9 times out of 15 — [measured below](#does-the-confidence-label-mean-anything), not asserted.

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
        uses: aryamthecodebreaker/FixMap@v0.8.3
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

The Action upserts the newest matching marked pull-request comment, writes the complete report to the step summary, and exposes `report`, `context-count`, and `test-route-count` outputs. Plan and verify accept `working-tree`/`include-untracked`; plan also accepts `limit` and comma- or newline-separated `exclude`. Explain and compare remain CLI/MCP-only because Action comments operate on complete reports. Pin a [release tag](https://github.com/aryamthecodebreaker/FixMap/releases); a floating `v1` tag will follow wider acceptance testing.

To close the plan→edit→verify loop without leaving GitHub, save the plan as an artifact and check later pushes against it with `mode: verify`:

```yaml
      - id: plan
        uses: aryamthecodebreaker/FixMap@v0.8.3
        with:
          format: json
      - run: echo '${{ steps.plan.outputs.report }}' > fixmap-plan.json
      - uses: actions/upload-artifact@v4
        with:
          name: fixmap-plan
          path: fixmap-plan.json

      # In a later run, after the fix is pushed:
      - uses: aryamthecodebreaker/FixMap@v0.8.3
        with:
          mode: verify
          report-path: fixmap-plan.json
```

Verify mode exposes `finding-count` and `changed-file-count`, and fails the step only for an edit in a generated or retired location — the one finding that is wrong regardless of the task. Everything else is advisory, because a plan can be wrong and a change can still be right.

On forked pull requests, GitHub supplies a read-only token. FixMap warns instead of failing and keeps the full report in the step summary and outputs. Do not switch to `pull_request_target` while checking out untrusted fork code just to restore comments.

## Why trust the output?

FixMap is deliberately inspectable:

- **Deterministic:** the same task, repository, and diff produce the same ranking—there is no hidden model call.
- **Explainable:** every ranked file includes reasons such as path matches, content matches, exact definitions, changed-file evidence, or import proximity.
- **Local-first:** local repositories stay local; public URLs use an anonymous temporary checkout.
- **Non-executing:** FixMap never installs dependencies or runs repository build, test, hook, or package scripts.
- **Git-aware:** scans respect `.gitignore`; working-tree mode reports staged and unstaged tracked files as changed, adding untracked ones only when `--include-untracked` is explicit, though untracked source is always a ranking candidate; unresolved refs surface as errors and exit non-zero.
- **Monorepo-aware:** test routing understands npm, pnpm, Yarn, Bun, and workspace package boundaries.
- **Bounded:** file counts, text samples, issue bodies, network responses, and remote-fetch time are capped with explicit diagnostics.

Public repository inputs accept only canonical credential-free `https://github.com/owner/repository` URLs. FixMap disables credential helpers, inherited Git configuration, hooks, submodules, symlinks, and LFS smudging, then removes the checkout on success or failure. Public issue fetching uses GitHub’s fixed API host without credentials or redirects.

## Evidence, not hype

Most tools show you the benchmark they tuned on. Here is both.

![FixMap benchmark: the fixing file ranked in the top three for 8 of 12 held-out repositories never tuned against and 16 of 16 in the regression suite, with a 1.75-second median scan and rank.](docs/assets/fixmap-benchmark.svg)

FixMap is measured against real issues that were later fixed by a merged pull request. Each case pins the commit *before* the fix, feeds FixMap the issue text a maintainer actually wrote, and checks whether the file that fix changed appears in the ranking. Cases are chosen mechanically, and every input and output is checked in.

| | Held-out — 12 repos, **never tuned against** | Regression — 16 repos, guided development |
| --- | ---: | ---: |
| Fixing file ranked Top-1 | **7 / 12 — 58%** <br><sub>95% CI 32–81%</sub> | 11 / 16 — 69% <br><sub>95% CI 44–86%</sub> |
| Fixing file ranked Top-3 | **8 / 12 — 67%** <br><sub>95% CI 39–86%</sub> | 16 / 16 — 100% <br><sub>95% CI 81–100%</sub> |
| Wrong file ranked first while the right one was available | **2 / 12 — 17%** | 5 / 16 — 31% |

**Plan around the held-out column.** The regression suite is where the ranking heuristics were developed — a case missed, the ranker changed — so its 100% describes fit, not accuracy on your repository.

**And read the intervals, not the percentages.** At twelve cases one result flipping moves Top-3 by eight points. The honest statement is "roughly two thirds, with a wide interval", not a precise success probability. Anyone quoting these figures to two significant figures, including us, is overstating them.

Two things the point estimates hide. Held-out Top-1 (58%) remains close to its Top-3 (67%) — **when FixMap finds the file at all, it usually ranks it first**, which is what actually matters to an agent that opens one file. The tuned suite's 100% Top-3 still conceals that in 31% of those cases something wrong ranks above the answer, so an agent following it opens the wrong file first.

The three held-out misses are published with their real rankings in [`benchmarks/heldout/`](benchmarks/heldout), not removed or explained away.

Held-out repositories: mongoose, immer, jest, knex, mocha, React Hook Form, socket.io, svelte, vite, vue, winston, yargs. Regression repositories: Express, Axios, debug, ky, Zod, Pino, Fastify, Chalk, Vitest, ESLint, Webpack, Undici, Redux Toolkit, Prettier, Hono, and got.

Median scan and rank across the pinned repositories is **1.75 s**, measured over three warm runs each.

### Does the confidence label mean anything?

A confidence label is only useful if it predicts something. Across all 28 cases in both suites, when the top-ranked file is labeled:

| Top result labeled | Correct fixing file | | |
| --- | ---: | ---: | --- |
| high | 7 / 13 | **54%** | <sub>95% CI 29–77%</sub> |
| medium | 9 / 11 | 82% | <sub>95% CI 52–95%</sub> |
| low | 2 / 4 | 50% | <sub>95% CI 15–85%</sub> |

The bands are not monotonic in this 28-case sample, so the label is a heuristic rather than a calibrated probability. **High confidence still means “check this lead first,” not certainty.** The intervals overlap heavily at these sample sizes, and the raw counts are published so the limitation is visible.

Since v0.8.0 the label is also **scarce**. It used to come from an absolute score threshold, which on a real Zod task labeled all eight results high while the leader was nineteen points ahead of the runner-up — telling an agent the eighth guess was as safe to edit as the first. High is now reserved for a file that leads, ties the lead within two points, or carries definition-site evidence of its own; and a leader that merely out-talks a definition site below it is capped at medium. v0.8.1 also stops documentation code fences from claiming definition evidence and stops a non-leading explicit path from becoming high merely because it was named. The table above is regenerated from the current 16-case regression and 12-case held-out suites.

### Does it stay quiet when it should?

Ranking the right file matters less than not inventing one. An [adversarial suite](benchmarks/adversarial) runs fabricated identifiers, real identifiers from the wrong repository, vague requests, absent features, and runtime-only symptoms against real pinned repositories, and asserts FixMap does not overclaim:

| Result | Value |
| --- | ---: |
| Adversarial cases | 8 |
| **False-confidence rate** | **0.0** |

Fabricated identifiers produce a diagnostic naming them and a low-confidence report rather than a persuasive wrong answer.

**What is not claimed:** there is no tokens-saved or minutes-saved figure here. Establishing one honestly needs a controlled experiment running the same tasks with and without FixMap, which has not been done. Byte-based context-size proxies are recorded in [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md) and labeled as estimates, not savings.

Read the full [benchmark methodology and scanner measurements](docs/BENCHMARKS.md), or reproduce either suite yourself:

```bash
npm run evaluate:heldout
```

## What changed in v0.8.3

v0.8.3 corrects MCP comparison validation after an independent audit reproduced #398 against the published v0.8.2 package. `fixmap_compare` now rejects a truncated `{ "contextFiles": [] }` object, validates optional rank, score, and confidence fields when present, and still accepts complete reports that legitimately found zero context files. No ranking behavior or evaluation result changed.

## What changed in v0.8.2

v0.8.2 closes an audit sweep filed against v0.8.1. Windows path handling works throughout — exclusions, symlinks, and manifests saved with a byte order mark. `.vue`, `.svelte`, `.java`, `.php`, `.rb`, `.cs`, `.mts` and `.cts` rank, having previously been scanned but never treated as source. The URLs people actually paste are accepted, and an unresolvable `--diff` now exits non-zero instead of reporting success on a plan that was never diff-aware. New diagnostics name what the report used to leave silent, most importantly a file whose contents were never read but which still ranked on its path. Hit rates are unchanged; confidence is more conservative and better calibrated. Two proposed ranking changes were measured, found not to help, and rejected — the numbers are in the CHANGELOG.

Installation is now a release gate rather than a documentation promise. The publish workflow verifies npm `latest`, canonical package homepages, the CLI's exact core dependency, a clean global install with a real plan, the MCP Registry version, and the source commit before it creates the GitHub release. The website includes the complete install paths, all five MCP tools, and a realistic Plan → edit carefully → Verify agent conversation.

[See the 107-issue verification ledger](docs/releases/v0.8.1-issue-verification.md) · [Inspect the changelog](CHANGELOG.md) · [Open the v0.8.1 release](https://github.com/aryamthecodebreaker/FixMap/releases/tag/v0.8.1)

## What changed in v0.8.0

v0.8.0 closes all 22 open reports from a dogfooding sweep of v0.7.4. Two themes run through it.

**FixMap was accurate about JavaScript and imprecise about everything else.** Go and Rust repositories returned ranked files and no test command at all, which is ranking without any way to check the change. Both now route `go test ./...` and `cargo test`, workspace-scoped to the crate being edited. Language is read from the root manifest rather than by asking whether any file ends in `.py` — which had labeled clap-rs/clap, a Rust project with one helper script, a Python repository.

**High confidence meant "in the list" rather than "the answer".** It came from an absolute score threshold, so a real Zod task labeled all eight results high while the leader was nineteen points clear. High is now reserved for a file that leads, ties the lead, or carries definition-site evidence, and a leader that merely out-talks a definition site below it is capped at medium.

New surface: `fixmap doctor`, `plan --compare`, `--exclude` and `.fixmapignore`, `--limit`, `--working-tree`, progress phases on stderr, the `fixmap_explain` MCP tool, `mode: verify` for the Action, and pull request URLs accepted as task input. Fixed: `verify --output` created no file, duplicate `--repo`/`--format` flags silently kept the last value, and diagnostics echoed unbounded user text — including a quadratic-backtracking path that took 2.4 seconds on a 30,000-character paste, on a code path the Action feeds from public pull requests.

[Inspect the changelog](CHANGELOG.md) · [See the held-out results](benchmarks/heldout/README.md) · [See every regression ranking](benchmarks/external/README.md) · [Audit the efficiency assumptions](docs/BENCHMARKS.md)

## Watch it work

[![FixMap launch film preview: a terminal report showing the ranked reset-password context file, its related test route, and a high authentication risk note.](apps/web/public/fixmap-launch-poster.jpg)](https://usefixmap.vercel.app/fixmap-launch.mp4)

[Play the launch film](https://usefixmap.vercel.app/fixmap-launch.mp4) · [Explore the browser demo](https://usefixmap.vercel.app/demo) · [Open the repository](https://github.com/aryamthecodebreaker/FixMap)

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

FixMap ranks files with these extensions, and only these:

`.cjs` `.cs` `.css` `.cts` `.go` `.java` `.js` `.json` `.jsx` `.md` `.mjs` `.mts` `.php` `.py` `.rb` `.rs` `.svelte` `.ts` `.tsx` `.vue` `.yaml` `.yml`

Anything else is reported by `--explain` as outside the supported set rather than scored. `.vue` and `.svelte` files are sampled from their `<script>` block, so template and style text does not outvote the logic.

Depth varies by ecosystem and the difference is deliberate. JavaScript and TypeScript get the most: package-script test routing, workspace awareness, and import-graph proximity. Go and Rust are routed from their manifests. Python is detected and named but not routed, because pytest, tox, unittest, and nox are all plausible for the same repository and a guessed command that fails is worse than an honest suggestion. Java, PHP, Ruby, and C# rank on path and content only — no test routing.

FixMap does not claim that a ranked file is correct, execute suggested commands, or hide failed diff resolution.

Next priorities include:

- growing the held-out suite past twelve cases, where the confidence interval is still wide enough to matter
- measuring agent success with and without FixMap, which is the only honest route to a savings figure
- adding co-change and ownership signals
- publishing more monorepo adapters and examples
- promoting a stable `v1` Action tag after wider acceptance testing

**Real failure reports are worth more here than any of the above.** If FixMap ranks the wrong file on your repository, that case is more useful than one selected by our own rule — open an issue with the task text and the repository, and it becomes a permanent benchmark case.

See [open issues](https://github.com/aryamthecodebreaker/FixMap/issues) for scoped work, or start with [CONTRIBUTING.md](CONTRIBUTING.md). Security reports belong in the process described by [SECURITY.md](SECURITY.md).

## License

MIT © FixMap contributors.

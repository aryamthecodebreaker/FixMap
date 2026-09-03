# Cross-Repository Regression Suite

A reproducible evaluation of FixMap's context ranking against real, already-fixed issues in permissively licensed JavaScript/TypeScript repositories. It complements the small self-repository gate in [`benchmarks/cases.json`](../cases.json).

> **This suite measures regression, not generalization.** Its cases guided v0.7.1 ranking work — when a case missed, the ranker changed — so its hit rates describe how well FixMap fits code it has already been shaped by. For unseen evidence, use the unmentioned cohort in [`benchmarks/heldout/`](../heldout) with its BM25 baseline beside it. Quoting this suite's 100% alone overstates accuracy.

## Dataset

[`dataset.json`](dataset.json) contains 16 cases across 16 MIT-licensed repositories:

| Repository | License | Issue | Fixing PR | Pinned base SHA |
| --- | --- | --- | --- | --- |
| expressjs/express | MIT | [#7365](https://github.com/expressjs/express/issues/7365) | [#7366](https://github.com/expressjs/express/pull/7366) | `ba006766fb96` |
| axios/axios | MIT | [#6721](https://github.com/axios/axios/issues/6721) | [#11059](https://github.com/axios/axios/pull/11059) | `ff60b43277c3` |
| debug-js/debug | MIT | [#746](https://github.com/debug-js/debug/issues/746) | [#926](https://github.com/debug-js/debug/pull/926) | `d1616622e4d4` |
| sindresorhus/ky | MIT | [#857](https://github.com/sindresorhus/ky/issues/857) | [#858](https://github.com/sindresorhus/ky/pull/858) | `4ba8c15feaca` |
| colinhacks/zod | MIT | [#5944](https://github.com/colinhacks/zod/issues/5944) | [#5945](https://github.com/colinhacks/zod/pull/5945) | `1fb56a5c18c2` |
| pinojs/pino | MIT | [#1996](https://github.com/pinojs/pino/issues/1996) | [#2432](https://github.com/pinojs/pino/pull/2432) | `5a236d74a086` |
| fastify/fastify | MIT | [#6671](https://github.com/fastify/fastify/issues/6671) | [#6680](https://github.com/fastify/fastify/pull/6680) | `5f4871f931d4` |
| chalk/chalk | MIT | [#624](https://github.com/chalk/chalk/issues/624) | [#688](https://github.com/chalk/chalk/pull/688) | `8a94e0ebfc49` |
| vitest-dev/vitest | MIT | [#7375](https://github.com/vitest-dev/vitest/issues/7375) | [#10798](https://github.com/vitest-dev/vitest/pull/10798) | `22d353a80c23` |
| eslint/eslint | MIT | [#478](https://github.com/eslint/eslint/issues/478) | [#21082](https://github.com/eslint/eslint/pull/21082) | `e7d1e4373bf6` |
| webpack/webpack | MIT | [#15371](https://github.com/webpack/webpack/issues/15371) | [#21503](https://github.com/webpack/webpack/pull/21503) | `61d4136e6d16` |
| nodejs/undici | MIT | [#5566](https://github.com/nodejs/undici/issues/5566) | [#5569](https://github.com/nodejs/undici/pull/5569) | `87270e46a226` |
| reduxjs/redux-toolkit | MIT | [#5156](https://github.com/reduxjs/redux-toolkit/issues/5156) | [#5344](https://github.com/reduxjs/redux-toolkit/pull/5344) | `e4725cece4b4` |
| prettier/prettier | MIT | [#5738](https://github.com/prettier/prettier/issues/5738) | [#19687](https://github.com/prettier/prettier/pull/19687) | `1cfcbbb99342` |
| honojs/hono | MIT | [#3281](https://github.com/honojs/hono/issues/3281) | [#5142](https://github.com/honojs/hono/pull/5142) | `cadff88bba34` |
| sindresorhus/got | MIT | [#2459](https://github.com/sindresorhus/got/issues/2459) | [#2460](https://github.com/sindresorhus/got/pull/2460) | `28c0ca3c6571` |

Each case pins the fixing PR's **base commit** (the repository state while the bug existed), uses the linked issue title plus the first 600 characters of its body as the task text, and uses the PR's changed source files as the expected answer. The fixed input cap can end mid-token and can omit file hints that appear later in an issue; this is part of the frozen benchmark rather than something adjusted after seeing rankings.

**Selection rule (frozen before any ranking was measured):** per repository, the most recent merged pull request out of the 50 most recent that closes an issue whose body is at least 80 characters, is not a docs-titled change, and modifies 1–3 source files after excluding tests, docs, examples, configuration, and lockfiles. Expected files were verified to exist at the pinned SHA. Cases must not be edited to match ranking output; when ranking behavior changes, rerun the evaluation and update the results below instead.

**Dataset contents:** the dataset stores only facts, links, file paths, commit SHAs, and short excerpts from public issues. No repository source code is redistributed; repositories are cloned from upstream at evaluation time.

## Running it

```bash
npm ci
npm run build:core
node scripts/evaluate-external.mjs          # report only
node scripts/evaluate-external.mjs --gate   # also fail below regression floors
npm run evaluate:external:record            # deliberately refresh results.json
node scripts/evaluate-baseline.mjs --suite external --check-recorded
```

The first run shallow-clones each repository at its pinned SHA into the OS temp directory (network required); later runs reuse the clones. Because of the network dependency this is not part of `npm run ci`; the [`external-eval` workflow](../../.github/workflows/external-eval.yml) runs it on a weekly schedule and on manual dispatch. Scheduled and release runs use `--check-recorded`, so a ranking change must deliberately refresh and review [`results.json`](results.json).

Baseline runs print scan, ranking, and end-to-end timings for live performance diagnosis. Those machine-dependent values and checkout-specific candidate counts are intentionally omitted from committed `baseline-results.json`; `--check-recorded` compares deterministic rankings, hit outcomes, and evidence only.

## Results

Measured 2026-08-04 on the dataset above (Node v24, `rankContextFiles` with a top-5 window):

| Metric | Hit rate |
| --- | --- |
| top-1 | 11/16 (68.8%) |
| top-3 | 16/16 (100%) |
| top-5 | 16/16 (100%) |

Three tasks name an expected fixing path; the derived unmentioned cohort is 9/13 (69.2%) Top-1 and 13/13 Top-3/Top-5. On that cohort BM25-over-code measures 5/13 Top-1 and 8/13 Top-3/Top-5. FixMap leads here, but these cases shaped its ranker, so that difference remains regression evidence rather than a generalization claim. Per-arm rankings are in [`baseline-results.json`](baseline-results.json).

The freshly measured pre-change baseline on the original expanded 15-case dataset was 6/15 (40%) Top-1, 10/15 (67%) Top-3, and 10/15 (67%) Top-5. It was measured against the untouched pre-v0.7.1 ranker; it was not copied from the stale historical `results.json`.

The v0.7.1 changes add honest identifier grounding and general ranking evidence for member references, explicit paths and literals, type-focused tasks, HTTP/2 naming, and issue-template noise. Those changes move the expected fixing file into the Top-3 for all five previously missed cases. They do not special-case repository names or expected paths.

The Chalk case is a deliberate guard against blanket vendor exclusion: its only color-detection implementation is `source/vendor/supports-color/index.js`, which remains the Top-1 result. FixMap trusts `git ls-files --exclude-standard`, then drops generated output only when its maintained source counterpart is present. The got case moved here from held-out when its GitHub blob permalink exposed a ranking regression and informed the fix; retaining it as unseen evidence would have been dishonest.

The exact per-case top-five rankings are checked in at [`results.json`](results.json). Sixteen cases are useful regression evidence, not a general claim that FixMap is 100% accurate.

The `--gate` floors (top-1 ≥ 0.3, top-3 ≥ 0.5, top-5 ≥ 0.5) exist only to catch ranking collapses in the scheduled run. They are deliberately below measured performance and are not accuracy claims or targets.

## Runtime and context-size comparison

`npm run benchmark:savings` runs scan + rank three times per pinned repository and reports the median. The recorded result in [`savings-results.json`](savings-results.json) measured:

| Quantity | Result | Classification |
| --- | ---: | --- |
| Median scan + rank time | 1.75 s | Measured |
| All supported scanned text | 22,058,578 tokens | Assumed baseline, estimated as UTF-8 bytes ÷ 4 |
| Top-five ranked context | 318,546 tokens | Estimated as UTF-8 bytes ÷ 4 |
| Context reduction | 98.56% | Estimated from the two byte-based proxies |
| Difference vs 15-minute manual triage | 14.97 min | Implied from an assumed baseline |

“Supported scanned text” means every scanned `.cjs`, `.css`, `.go`, `.js`, `.json`, `.jsx`, `.md`, `.mjs`, `.py`, `.rs`, `.ts`, `.tsx`, `.yaml`, or `.yml` file, including tests and documentation—not only implementation code.

The 15-minute manual baseline was **not measured in a controlled with/without-agent experiment**. It is included only as a replaceable scenario; pass `--assumed-manual-minutes` to change it. The benchmark makes no claim that an agent will save that amount of time in real work.

```bash
npm run benchmark:savings
npm run benchmark:savings:record
npm run render:benchmark-card
```

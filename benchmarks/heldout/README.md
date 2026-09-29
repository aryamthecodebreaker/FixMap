# Held-Out Ranking Evaluation

This suite exists because [`benchmarks/external/`](../external) can no longer answer the question people actually care about.

The regression cases guided ranking work: when a case missed, the ranker changed. Every heuristic in v0.7.1 was written by someone who had already seen which of those repositories FixMap got wrong, and later cases move there whenever they inform another change. That makes the suite good regression evidence and useless as a generalization estimate — a 100% top-3 measured on cases that shaped the code is a statement about fitting, not about the next repository you point FixMap at.

These 12 repositories were selected by the same frozen rule. When a case informs ranking work, it moves to regression and a fresh mechanically selected replacement takes its place; nothing in the current set has been tuned against.

## Dataset

[`dataset.json`](dataset.json) contains 12 cases across 12 MIT-licensed repositories, none of which appear in the regression suite:

| Repository | Issue | Expected fixing file |
| --- | --- | --- |
| Automattic/mongoose | [#16379](https://github.com/Automattic/mongoose/issues/16379) | `lib/document.js` |
| immerjs/immer | [#1045](https://github.com/immerjs/immer/issues/1045) | `src/types/types-external.ts` |
| jestjs/jest | [#16174](https://github.com/jestjs/jest/issues/16174) | `packages/jest-mock/src/index.ts` |
| knex/knex | [#5053](https://github.com/knex/knex/issues/5053) | `lib/dialects/postgres/query/pg-querycompiler.js` |
| mochajs/mocha | [#4526](https://github.com/mochajs/mocha/issues/4526) | `lib/reporters/xunit.js` |
| react-hook-form/react-hook-form | [#13608](https://github.com/react-hook-form/react-hook-form/issues/13608) | `src/logic/createFormControl.ts` |
| socketio/socket.io | [#5462](https://github.com/socketio/socket.io/issues/5462) | `packages/engine.io-client/lib/socket.ts` |
| sveltejs/svelte | [#18555](https://github.com/sveltejs/svelte/issues/18555) | `packages/svelte/src/internal/client/dom/blocks/boundary.js` |
| vitejs/vite | [#10136](https://github.com/vitejs/vite/issues/10136) | `packages/vite/src/node/server/bundledDev.ts` |
| vuejs/core | [#11564](https://github.com/vuejs/core/issues/11564) | `packages/runtime-dom/src/index.ts` |
| winstonjs/winston | [#2610](https://github.com/winstonjs/winston/issues/2610) | `lib/winston/transports/file.js` |
| yargs/yargs | [#2497](https://github.com/yargs/yargs/issues/2497) | `lib/utils/apply-extends.ts` |

**Selection rule** — identical to the regression suite, applied mechanically: per repository, the most recent merged pull request out of the 50 most recent that closes an issue whose body is at least 80 characters, is not a docs-titled change, and modifies 1–3 source files after excluding tests, docs, examples, configuration, and lockfiles. Each case pins the fixing PR's base commit, uses the issue title plus the first 600 characters of its body as the task text, and takes the PR's changed source files as the expected answer.

**Exclusions, all decided before any ranking was measured:** `date-fns/date-fns` and `rollup/rollup` were dropped because their licenses do not report as MIT. `babel/babel` was dropped because it cannot be checked out on Windows — a path-length limit in the test fixtures, unrelated to ranking. `pmndrs/zustand` and `TanStack/query` produced no pull request matching the rule.

## Results

Verified 2026-08-13 (Node v24, `rankContextFiles` with a top-5 window):

Three tasks name their expected fixing file in the issue text. They legitimately test FixMap's explicit-file-mention signal, but they do not test whether it can locate a file the task did not name. The evaluator therefore derives and reports both cohorts every run:

| Cohort | Cases | Top-1 | Top-3 | Top-5 |
| --- | ---: | ---: | ---: | ---: |
| Task did not name the file | 9 | **3/9 (33.3%)** | **5/9 (55.6%)** | **5/9 (55.6%)** |
| Task named the file | 3 | 3/3 (100%) | 3/3 (100%) | 3/3 (100%) |
| Pooled | 12 | 6/12 (50.0%) | 8/12 (66.7%) | 8/12 (66.7%) |

**Plan around the unmentioned cohort.** At nine cases its Top-3 95% Wilson interval is 27–81%, so the point estimate is exploratory rather than a precise success probability. The four Top-5 misses — `jestjs/jest`, `knex/knex`, `vitejs/vite`, and `vuejs/core` — remain recorded in [`results.json`](results.json) with their actual rankings.

## Baseline-relative result

[`baseline-results.json`](baseline-results.json) scores FixMap and naive retrieval against the same scan, text samples, and truncation. On the nine unmentioned cases:

| Arm | Top-1 | Top-3 | Top-5 |
| --- | ---: | ---: | ---: |
| Literal keyword retrieval, code files | 2/9 | 4/9 | 6/9 |
| BM25 retrieval, code files | **4/9** | **5/9** | **9/9** |
| FixMap | 3/9 | 5/9 | 5/9 |

FixMap does not beat BM25-over-code on this unseen cohort: BM25 leads Top-1 4/9 to 3/9, Top-3 ties at 5/9, and BM25 leads Top-5 9/9 to 5/9. With nine cases this is not a stable effect-size estimate, but an advantage over naive retrieval is not established.

## Confidence calibration

Both suites record the confidence label on the top-ranked file, so the label can be checked against outcomes rather than trusted. Across all 28 cases:

| Top result labeled | Correct | Accuracy |
| --- | ---: | ---: |
| high | 5 / 6 | 83% |
| medium | 11 / 19 | 58% |
| low | 1 / 3 | 33% |

The ordering is not monotonic in this small sample, so the labels must not be read as calibrated probabilities. Counts are published so readers can weigh that limitation themselves. Per-suite figures are in each `results.json` under `calibration`.

## Running it

```bash
npm run build:core
npm run evaluate:heldout           # report only
npm run evaluate:heldout:record    # deliberately refresh results.json
node scripts/evaluate-baseline.mjs --suite heldout
node scripts/evaluate-baseline.mjs --suite heldout --check-recorded
```

The baseline command prints scan, ranking, and end-to-end timings, but committed results omit those machine-dependent values and checkout-specific candidate counts. `--check-recorded` compares deterministic rankings, hit outcomes, and evidence only.

## Rules for this suite

1. **Never tune against these cases.** The moment a ranking change is made because one of them missed, this suite becomes a second regression suite and stops measuring generalization. Move the case into `benchmarks/external/` and select a fresh replacement.
2. **Do not edit a case to match output.** When ranking behavior changes, rerun and update the recorded results.
3. **Report cohorts and the baseline.** Do not present the pooled held-out rate as generalization evidence, or present a FixMap rate without the naive retrieval result beside it.

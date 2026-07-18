# Cross-Repository Ranking Evaluation

A reproducible evaluation of FixMap's context ranking against real, already-fixed issues in permissively licensed JavaScript/TypeScript repositories. It complements the small self-repository gate in [`benchmarks/cases.json`](../cases.json).

## Dataset

[`dataset.json`](dataset.json) contains 6 cases across 6 MIT-licensed repositories:

| Repository | License | Issue | Fixing PR | Pinned base SHA |
| --- | --- | --- | --- | --- |
| expressjs/express | MIT | [#7365](https://github.com/expressjs/express/issues/7365) | [#7366](https://github.com/expressjs/express/pull/7366) | `ba006766fb96` |
| axios/axios | MIT | [#6721](https://github.com/axios/axios/issues/6721) | [#11059](https://github.com/axios/axios/pull/11059) | `ff60b43277c3` |
| debug-js/debug | MIT | [#746](https://github.com/debug-js/debug/issues/746) | [#926](https://github.com/debug-js/debug/pull/926) | `d1616622e4d4` |
| sindresorhus/ky | MIT | [#857](https://github.com/sindresorhus/ky/issues/857) | [#858](https://github.com/sindresorhus/ky/pull/858) | `4ba8c15feaca` |
| colinhacks/zod | MIT | [#5944](https://github.com/colinhacks/zod/issues/5944) | [#5945](https://github.com/colinhacks/zod/pull/5945) | `1fb56a5c18c2` |
| pinojs/pino | MIT | [#1996](https://github.com/pinojs/pino/issues/1996) | [#2432](https://github.com/pinojs/pino/pull/2432) | `5a236d74a086` |

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
```

The first run shallow-clones each repository at its pinned SHA into the OS temp directory (network required); later runs reuse the clones. Because of the network dependency this is not part of `npm run ci`; the [`external-eval` workflow](../../.github/workflows/external-eval.yml) runs it on a weekly schedule and on manual dispatch. Scheduled and release runs use `--check-recorded`, so a ranking change must deliberately refresh and review [`results.json`](results.json).

## Results

Measured 2026-07-18 on the dataset above (FixMap v0.5.1, Node v24, `rankContextFiles` with a top-5 window):

| Metric | Hit rate |
| --- | --- |
| top-1 | 3/6 (50%) |
| top-3 | 5/6 (83%) |
| top-5 | 5/6 (83%) |

Remaining miss: zod #5944 (fix lives in `regexes.ts`; the 600-character task excerpt ends inside the reported pattern, and ranking surfaces the JSON-schema modules that consume it).

The exact per-case top-five rankings are checked in at [`results.json`](results.json).

The `--gate` floors (top-1 ≥ 0.3, top-3 ≥ 0.5, top-5 ≥ 0.5) exist only to catch ranking collapses in the scheduled run. They are deliberately below measured performance and are not accuracy claims or targets.

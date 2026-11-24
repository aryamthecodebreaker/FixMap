# Context Pack excerpt selection

`scripts/evaluate-context.mjs` measures whether the Context Pack's excerpts contain the lines a
real fix changed. Cases: the 35 development cases in `benchmarks/external` and
`benchmarks/polyglot-dev` (held-out suites are not used for tuning). For each case FixMap plans
the task at the pinned commit, builds Context Packs at 4,000 and 10,000 estimated tokens, and
compares each excerpt with the old-side line numbers of the merged pull request's diff.

The rule, set before any change: a new picker ships only if it improves at both budgets without
exceeding any budget.

## Current picker (baseline, `baseline-results.json`)

| Budget | Fix-file excerpts containing a changed line | Cases with any changed line | Over budget |
| --- | --- | --- | --- |
| 4,000 | 28 of 35 | 23 of 35 | 0 |
| 10,000 | 36 of 38 | 26 of 35 | 0 |

## Candidates tried, 2026-11-24 (neither shipped)

1. **Densest window.** Choose the window that fits the allowance and holds the most distinct
   task identifiers (weighted) and terms. 4k: 27 of 35; 10k: 34 of 38. Worse: it won prettier
   and cobra but lost fastify, tokio, serilog and express, where the single strongest line
   (usually the key identifier's definition) mattered more than word density.
2. **Densest window containing the strongest line.** The same scan, restricted to windows that
   include the best-scoring line. 4k: 28 of 35; 10k: 36 of 38, identical to the baseline case by
   case. Neutral, so not shipped.

Variant 2 is kept as `rejected-densest-window.patch`. The current picker already places the
fixed lines in most excerpts it includes; the larger loss is files that never enter the pack
(9 of 35 cases at 10k), which is a ranking question, not an excerpt question.

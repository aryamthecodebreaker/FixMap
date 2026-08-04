# I audited FixMap's benchmark and found it was leaking answers

FixMap's held-out benchmark was meant to answer one question: when a task does not tell you where to look, does FixMap surface the file that later fixed it?

Three of its twelve tasks did tell FixMap where to look. Mongoose named `lib/document.js` with a line number; the Svelte and yargs tasks included the expected path in their text. All three ranked Top-1. They remain valid tests of explicit-file-mention handling, but they cannot count as evidence that FixMap located an unnamed file.

## The corrected cohorts

| Held-out cohort | Cases | Top-1 | Top-3 | Top-5 |
| --- | ---: | ---: | ---: | ---: |
| Task did not name the file | 9 | 4/9 (44.4%) | 5/9 (55.6%) | 6/9 (66.7%) |
| Task named the file | 3 | 3/3 | 3/3 | 3/3 |
| Pooled, previously published | 12 | 7/12 (58.3%) | 8/12 (66.7%) | 9/12 (75.0%) |

The split is computed from the task and expected paths during every evaluation. It is not a hand-maintained dataset label. With nine unmentioned cases the uncertainty is still large: the Top-3 95% Wilson interval is 27–81%.

## The missing baseline changed the conclusion

The published hit rate had never been compared with naive retrieval. The audit now runs FixMap, literal keyword retrieval, and BM25 against one shared repository scan per case. Each arm sees the same file paths, text samples, and truncation.

On held-out tasks that did not name the file:

| Arm | Top-1 | Top-3 | Top-5 |
| --- | ---: | ---: | ---: |
| Literal retrieval over code files | 2/9 | 4/9 | 6/9 |
| BM25 over code files | 4/9 | 5/9 | 9/9 |
| FixMap | 4/9 | 5/9 | 6/9 |

FixMap does not beat BM25-over-code on this unseen cohort. It ties at Top-1 and Top-3, while BM25 finds all nine expected files within five results and FixMap finds six. A paired exact test cannot establish a stable advantage at this sample size; the honest conclusion is that FixMap's advantage over naive retrieval is unproven.

## What changes now

- Public evidence leads with the unmentioned cohort, with the BM25 result beside it.
- Pooled results remain available for audit but are labeled as pooled rather than generalization evidence.
- Distribution based on a “better than search” claim is paused.
- Ranking and dataset work must improve recall on fresh, mechanically selected cases without tuning against cases that remain held out.

Reproduce the recorded results:

```bash
npm run build:core
node scripts/evaluate-external.mjs --suite heldout --check-recorded
node scripts/evaluate-baseline.mjs --suite heldout --check-recorded
```

The complete per-case outputs are in [`benchmarks/heldout/results.json`](../../benchmarks/heldout/results.json) and [`benchmarks/heldout/baseline-results.json`](../../benchmarks/heldout/baseline-results.json).

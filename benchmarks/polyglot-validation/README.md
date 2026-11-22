# Polyglot post-change validation cohort

This cohort is a one-shot validation check for the deterministic rank-fusion candidate
that was fixed before the dataset was generated:

- structural rank weight: 1
- whole-file BM25 rank weight: 4
- symbol BM25 rank weight: 1
- reciprocal-rank constant: 60

Cases use the same mechanical selection rule and repositories as `polyglot-dev`, but must
come from pull requests merged after 2026-08-22 23:59:59 UTC. Pull requests already in the
development cohort are excluded. The dataset is frozen before FixMap or the candidate is
measured, and the candidate weights must not be adjusted from validation results.

Generate the frozen dataset with:

```bash
node scripts/freeze-polyglot-cohort.mjs --suite polyglot-validation --record
```

This development-time collection uses public GitHub metadata. It adds no network, API,
account, model, or source-upload behavior to the FixMap product.

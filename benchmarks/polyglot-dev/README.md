# Polyglot development cohort

This cohort covers Go, Rust, Ruby, PHP, and .NET. It is development-only and cannot support a generalization claim.

Freeze it before measuring FixMap:

```bash
node scripts/freeze-polyglot-cohort.mjs --record
```

The repository and language list is explicit in `repositories.json`. For each repository, selection takes the first of the 100 most recently updated merged pull requests that closes a substantive issue, is not documentation-titled, changes at most 20 files, and modifies 1–3 non-test implementation files in the configured language. The PR base commit and exact fixing paths are frozen from GitHub metadata before FixMap runs.

Repositories without an eligible case remain recorded under `skipped`; they are not replaced after ranking is observed. Cases that influence implementation stay permanently as regression evidence. A separate cohort frozen after development is required for any held-out claim.

## Development-only reranker ablations

Rank-only fusion experiments are deliberately opt-in and write a separate artifact, so they
cannot replace or validate `baseline-results.json`:

```bash
node scripts/evaluate-baseline.mjs --suite polyglot-dev --reranker-ablations --record-ablation
node scripts/evaluate-baseline.mjs --suite polyglot-dev --reranker-ablations --check-ablation
```

The recorded BM25-heavy RRF arm ties BM25-over-code at Top-1 (57.9%) and leads it at Top-3
(78.9% vs 68.4%) and Top-5 (84.2% vs 73.7%) on this development cohort. It recovers three
of the five shipped-ranker misses but still misses the Clap and Cargo targets that BM25 finds.
These weights were inspected on this cohort, are not shipped Core behavior, and cannot support
a superiority or generalization claim. Any adoption requires a newly frozen unseen cohort.
